import "server-only";
import type { PoolClient } from "pg";
import { audit } from "./audit";
import { isExclusionViolation, q, tx } from "./db";
import { MIN_LEAD_HOURS, PARENT_RESPONSE_HOURS, SESSION_MINUTES, TEACHER_RESPONSE_HOURS, type Subject } from "./domain";
import { BookingError, slotsForRange, subscriptionHeadroom, type Sub } from "./booking";
import { enqueueAdmin, kickOutbox, queueForBooking } from "./email";
import { autoMeetingsReady, ensureBookingMeeting } from "./teams";
import { dateLabel, riyadhDateKey, riyadhParts, riyadhToUtc, timeLabel } from "./time";

/*
 * Booking requests. A parent's booking starts as `requested`; the teacher has TEACHER_RESPONSE_HOURS to answer.
 *   accept           → scheduled (Teams link, confirmation email)
 *   decline/timeout  → same time with another free teacher (`requested` again), else
 *                      nearest free time → `proposed` (teacher approves first, then the parent), else
 *                      the parent is asked to pick a time. The credit is never consumed until confirmed.
 * Every step is a new row linked by replaced_by (nothing is deleted or rewritten).
 */

const MAX_STEPS = 6;              // hand-offs + proposals for one request before we ask the parent to choose
const PROPOSAL_SEARCH_DAYS = 14;  // how far ahead we look for an alternative
const SAME_TIME_MIN_HOURS = 4;    // a same-time hand-off needs at least this long before the session

type Row = {
  id: string; chain_id: string; attempt: number; status: string; proposal_stage: "teacher" | "parent" | null;
  subscription_id: string; parent_id: string; student_id: string; teacher_id: string; subject: Subject; track: string;
  starts_at: Date; ends_at: Date; description: string; created_by: string; teacher_name: string; student_name: string;
};

async function lock(c: PoolClient, id: string): Promise<Row | undefined> {
  const { rows } = await c.query<Row>(
    `SELECT b.*, t.full_name teacher_name, s.full_name student_name
       FROM bookings b JOIN users t ON t.id = b.teacher_id JOIN students s ON s.id = b.student_id
      WHERE b.id = $1 FOR UPDATE OF b`, [id]);
  return rows[0];
}

const when = (d: Date) => `${dateLabel(d)} الساعة ${timeLabel(d)}`;
const awaitingTeacher = (r: Row) => r.status === "requested" || (r.status === "proposed" && r.proposal_stage === "teacher");

// ------------------------------------------------------------------ teacher answers

export async function acceptByTeacher(teacherId: string, bookingId: string) {
  const outcome = await tx(async (c) => {
    const r = await lock(c, bookingId);
    if (!r || r.teacher_id !== teacherId) throw new BookingError("الطلب غير موجود.");
    if (!awaitingTeacher(r)) throw new BookingError("هذا الطلب لم يعد بانتظار ردكِ.");
    if (r.starts_at.getTime() < Date.now()) throw new BookingError("مضى موعد هذا الطلب.");
    if (r.status === "requested") {
      await c.query(`UPDATE bookings SET status = 'scheduled', confirmed_at = now(), respond_by = NULL WHERE id = $1`, [r.id]);
      await audit("booking.accept", "booking", r.id, teacherId, {}, c);
      await queueForBooking(c, r.id, "parent", "booking_parent", {}, `booked:${r.id}:parent`);
      return "confirmed" as const;
    }
    // proposal approved by the teacher → now the parent decides
    await c.query(
      `UPDATE bookings SET proposal_stage = 'parent',
              respond_by = LEAST(now() + make_interval(hours => $2), starts_at - interval '2 hours') WHERE id = $1`,
      [r.id, PARENT_RESPONSE_HOURS]);
    await audit("booking.proposal_teacher_ok", "booking", r.id, teacherId, {}, c);
    await queueForBooking(c, r.id, "parent", "proposal_parent");
    return "proposed_to_parent" as const;
  });
  if (outcome === "confirmed") await ensureBookingMeeting(bookingId).catch(() => false);
  await kickOutbox();
  return outcome;
}

export async function declineByTeacher(teacherId: string, bookingId: string, reason: string) {
  const text = reason.trim();
  if (text.length < 5) throw new BookingError("اكتبي سبب الاعتذار (خمسة أحرف على الأقل).");
  await tx(async (c) => {
    const r = await lock(c, bookingId);
    if (!r || r.teacher_id !== teacherId) throw new BookingError("الطلب غير موجود.");
    if (!awaitingTeacher(r)) throw new BookingError("هذا الطلب لم يعد بانتظار ردكِ.");
    await handOff(c, r, "teacher", text.slice(0, 500), teacherId);
  });
  await kickOutbox();
}

// ------------------------------------------------------------------ parent answers a proposal

export async function respondByParent(parentId: string, bookingId: string, accept: boolean) {
  await tx(async (c) => {
    const r = await lock(c, bookingId);
    if (!r || r.parent_id !== parentId) throw new BookingError("الطلب غير موجود.");
    if (!(r.status === "proposed" && r.proposal_stage === "parent")) throw new BookingError("هذا الاقتراح لم يعد متاحاً.");
    if (accept) {
      await c.query(`UPDATE bookings SET status = 'scheduled', confirmed_at = now(), respond_by = NULL WHERE id = $1`, [r.id]);
      await audit("booking.proposal_accept", "booking", r.id, parentId, {}, c);
      await queueForBooking(c, r.id, "parent", "booking_parent", {}, `booked:${r.id}:parent`);
      await queueForBooking(c, r.id, "teacher", "booking_teacher", {}, `booked:${r.id}:teacher`);
    } else {
      await c.query(`UPDATE bookings SET status = 'not_taken', decline_kind = 'parent', declined_at = now(), respond_by = NULL WHERE id = $1`, [r.id]);
      await audit("booking.proposal_decline", "booking", r.id, parentId, {}, c);
    }
  });
  if (accept) await ensureBookingMeeting(bookingId).catch(() => false);
  await kickOutbox();
}

// ------------------------------------------------------------------ background: deadlines

/** Requests whose deadline passed: move them on. Runs with the background job. */
export async function processOverdueRequests(limit = 50) {
  const due = await q<{ id: string }>(
    `SELECT id FROM bookings WHERE status IN ('requested','proposed') AND respond_by < now() ORDER BY respond_by LIMIT $1`, [limit]);
  let moved = 0;
  for (const { id } of due) {
    await tx(async (c) => {
      const r = await lock(c, id);
      if (!r || !["requested", "proposed"].includes(r.status)) return;
      moved++;
      if (awaitingTeacher(r)) return handOff(c, r, "timeout", "انتهت مهلة الرد", null);
      await c.query(`UPDATE bookings SET status = 'not_taken', decline_kind = 'parent_timeout', declined_at = now(), respond_by = NULL WHERE id = $1`, [r.id]);
      await audit("booking.proposal_expired", "booking", r.id, null, {}, c);
      await queueForBooking(c, r.id, "parent", "request_unplaced", { reason: "انتهت مهلة تأكيد الموعد البديل الذي اقترحناه." });
    }).catch(() => undefined);
  }
  if (moved) await kickOutbox();
  return moved;
}

export async function markDeclineReviewed(adminId: string, bookingId: string) {
  await q(`UPDATE bookings SET decline_reviewed_at = now(), decline_reviewed_by = $2
            WHERE id = $1 AND decline_kind IN ('teacher','timeout') AND decline_reviewed_at IS NULL`, [bookingId, adminId]);
  await audit("booking.decline_reviewed", "booking", bookingId, adminId);
}

// ------------------------------------------------------------------ hand-off engine

async function handOff(c: PoolClient, r: Row, kind: "teacher" | "timeout", reason: string, actor: string | null) {
  await c.query(`UPDATE bookings SET status = 'declined', decline_kind = $2, decline_reason = $3, declined_at = now(), respond_by = NULL
                  WHERE id = $1`, [r.id, kind, reason]);
  await audit(kind === "teacher" ? "booking.decline" : "booking.timeout", "booking", r.id, actor, { reason }, c);
  await enqueueAdmin(c, "admin_request_issue", {
    title: kind === "teacher" ? `اعتذار معلمة: ${r.teacher_name}` : `معلمة لم ترد على طلب: ${r.teacher_name}`,
    detail: `${r.student_name} · ${when(r.starts_at)}${r.status === "proposed" ? " (موعد بديل)" : ""}`, reason,
  }, `admin_decline:${r.id}`);

  if (r.attempt >= MAX_STEPS) return unplaced(c, r, "تعذّر تأكيد الموعد مع المعلمات المتاحات.");

  const { rows: subs } = await c.query<Sub>(`SELECT * FROM subscriptions WHERE id = $1`, [r.subscription_id]);
  const { rows: st } = await c.query<{ grade: number }>(`SELECT grade FROM students WHERE id = $1`, [r.student_id]);
  const sub = subs[0];
  if (!sub || !st[0]) return unplaced(c, r, "تعذّر تأكيد الموعد.");
  const grade = st[0].grade;
  const { rows: chain } = await c.query<{ teacher_id: string; starts_at: Date; status: string; proposal_stage: string | null; id: string }>(
    `SELECT id, teacher_id, starts_at, status, proposal_stage FROM bookings WHERE chain_id = $1`, [r.chain_id]);
  const root = chain.find((x) => x.id === r.chain_id)?.teacher_id ?? r.teacher_id;

  // 1) Same time, another free teacher (only for the originally requested time, and only if there's time to answer)
  if (r.status === "requested" && r.starts_at.getTime() - Date.now() >= SAME_TIME_MIN_HOURS * 3600_000) {
    const declinedHere = chain.filter((x) => x.status === "declined" && x.starts_at.getTime() === r.starts_at.getTime()).map((x) => x.teacher_id);
    const day = riyadhDateKey(r.starts_at);
    const slots = await slotsForRange({ sub, studentId: r.student_id, grade, subject: r.subject, fromKey: day, toKey: day,
      earliest: new Date(Date.now()), runner: c });
    const free = (slots.get(day)?.get(riyadhParts(r.starts_at).minutes) ?? []).filter((t) => !declinedHere.includes(t));
    for (const teacherId of free) {
      const id = await insertNext(c, r, { teacherId, startsAt: r.starts_at, status: "requested" });
      if (!id) continue;
      await queueForBooking(c, id, "teacher", "request_teacher", { hours: String(TEACHER_RESPONSE_HOURS) });
      await queueForBooking(c, id, "parent", "request_moved");
      return;
    }
  }

  // 2) Nearest free time (teacher approves first, then the parent)
  const refusedProposal = chain.filter((x) => x.status === "declined" && x.proposal_stage === "teacher").map((x) => x.teacher_id);
  const today = riyadhDateKey(new Date());
  const lastKey = sub.ends_at ? riyadhDateKey(new Date(Math.min(sub.ends_at.getTime() - 1, Date.now() + PROPOSAL_SEARCH_DAYS * 86400_000))) : today;
  const range = await slotsForRange({ sub, studentId: r.student_id, grade, subject: r.subject, fromKey: today, toKey: lastKey, runner: c,
    earliest: new Date(Date.now() + MIN_LEAD_HOURS * 3600_000) });
  const candidates: { teacherId: string; startsAt: Date; score: number }[] = [];
  for (const [day, slots] of range) {
    for (const [minute, teachers] of slots) {
      const startsAt = riyadhToUtc(day, minute);
      for (const teacherId of teachers) {
        if (refusedProposal.includes(teacherId)) continue;
        // never offer a teacher the exact time she already declined or let lapse
        if (chain.some((x) => x.status === "declined" && x.teacher_id === teacherId && x.starts_at.getTime() === startsAt.getTime())) continue;
        // closest to what the parent asked for; the teacher they chose first wins ties
        candidates.push({ teacherId, startsAt, score: Math.abs(startsAt.getTime() - r.starts_at.getTime()) + (teacherId === root ? 0 : 1) });
      }
    }
  }
  candidates.sort((a, b) => a.score - b.score);
  for (const cand of candidates.slice(0, 40)) {
    const head = await subscriptionHeadroom(c, sub, cand.startsAt);
    if (head.weekUsed >= head.weekAllowance) continue;
    const id = await insertNext(c, r, { teacherId: cand.teacherId, startsAt: cand.startsAt, status: "proposed" });
    if (!id) continue;
    await queueForBooking(c, id, "teacher", "proposal_teacher", { hours: String(TEACHER_RESPONSE_HOURS) });
    return;
  }

  // 3) Nothing fits: the parent chooses
  return unplaced(c, r, "لم نجد موعداً متاحاً قريباً من الموعد الذي طلبته.");
}

/** Next row of the chain. Returns null if the slot was taken in the meantime (the caller tries the next one). */
async function insertNext(c: PoolClient, r: Row, n: { teacherId: string; startsAt: Date; status: "requested" | "proposed" }) {
  const auto = await autoMeetingsReady();
  const { rows: t } = await c.query<{ teams_link: string | null }>(`SELECT teams_link FROM teacher_profiles WHERE user_id = $1`, [n.teacherId]);
  const endsAt = new Date(n.startsAt.getTime() + SESSION_MINUTES * 60_000);
  await c.query("SAVEPOINT next_row");
  try {
    const { rows } = await c.query<{ id: string }>(
      `INSERT INTO bookings (subscription_id, parent_id, student_id, teacher_id, subject, track, starts_at, ends_at, description,
                             teams_link, teams_source, created_by, status, proposal_stage, chain_id, attempt, respond_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
               LEAST(now() + make_interval(hours => $17), $7::timestamptz - interval '1 hour')) RETURNING id`,
      [r.subscription_id, r.parent_id, r.student_id, n.teacherId, r.subject, r.track, n.startsAt, endsAt, r.description,
       t[0]?.teams_link ?? "", auto ? "pending" : "teacher_link", r.created_by, n.status, n.status === "proposed" ? "teacher" : null,
       r.chain_id, r.attempt + 1, TEACHER_RESPONSE_HOURS]);
    await c.query(`UPDATE bookings SET replaced_by = $2 WHERE id = $1`, [r.id, rows[0].id]);
    await c.query("RELEASE SAVEPOINT next_row");
    await audit(n.status === "requested" ? "booking.handoff" : "booking.propose", "booking", rows[0].id, null,
      { from: r.id, teacher: n.teacherId, starts_at: n.startsAt.toISOString() }, c);
    return rows[0].id;
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT next_row");
    if (isExclusionViolation(e)) return null;
    throw e;
  }
}

async function unplaced(c: PoolClient, r: Row, reason: string) {
  await queueForBooking(c, r.id, "parent", "request_unplaced", { reason }, `unplaced:${r.chain_id}`);
  await enqueueAdmin(c, "admin_request_issue", {
    title: `طلب لم يُحجز: ${r.student_name}`, detail: `${when(r.starts_at)} · طُلب من ولي الأمر اختيار موعد آخر.`, reason,
  }, `admin_unplaced:${r.chain_id}`);
}

