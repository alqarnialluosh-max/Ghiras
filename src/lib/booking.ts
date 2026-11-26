import "server-only";
import { kickOutbox, queueBookingEmails, queueRescheduleEmails } from "./email";
import type { PoolClient } from "pg";
import { isExclusionViolation, q, tx } from "./db";
import { audit } from "./audit";
import { cancelMeeting, ensureBookingMeeting, teamsAutoConfigured } from "./teams";
import {
  BOOKING_HORIZON_DAYS, MIN_LEAD_HOURS, SESSION_MINUTES, SLOT_STEP_MINUTES,
  type Subject, type Track,
} from "./domain";
import { addDaysKey, riyadhDateKey, riyadhParts, riyadhToUtc, weekStartKey, weekdayOfKey } from "./time";

/** Statuses that consume a session credit. */
export const CONSUMING = ["scheduled", "completed", "student_absent"] as const;

export type Sub = {
  id: string; parent_id: string; student_id: string; subject: Subject | null; track: Track;
  status: string; sessions_total: number; weekly_limit: number | null; bonus_sessions: number;
  starts_at: Date | null; ends_at: Date | null; plan_code: string;
};

export class BookingError extends Error {
  constructor(public userMessage: string) { super(userMessage); }
}

type Runner = Pick<PoolClient, "query">;

export async function usedSessions(r: Runner, subId: string) {
  const { rows } = await r.query<{ n: string }>(
    `SELECT count(*) AS n FROM bookings WHERE subscription_id = $1 AND status = ANY($2::booking_status[])`,
    [subId, CONSUMING],
  );
  return Number(rows[0].n);
}

async function weekUsage(r: Runner, subId: string, weekKey: string) {
  const from = riyadhToUtc(weekKey, 0);
  const to = riyadhToUtc(addDaysKey(weekKey, 7), 0);
  const { rows } = await r.query<{ n: string }>(
    `SELECT count(*) AS n FROM bookings
      WHERE subscription_id = $1 AND status = ANY($2::booking_status[])
        AND starts_at >= $3 AND starts_at < $4`,
    [subId, CONSUMING, from, to],
  );
  return Number(rows[0].n);
}

/** The bonus (free first session) is usable in the first week on top of the weekly limit. */
function weeklyAllowance(sub: Sub, weekKey: string) {
  if (sub.weekly_limit == null) return Infinity;
  const firstWeek = sub.starts_at ? weekStartKey(sub.starts_at) === weekKey : false;
  return sub.weekly_limit + (firstWeek ? sub.bonus_sessions : 0);
}

export async function eligibleTeachers(subject: Subject, grade: number) {
  return q<{ id: string; full_name: string; bio: string; years_experience: number; qualification: string; teams_link: string }>(
    `SELECT u.id, u.full_name, p.bio, p.years_experience, p.qualification, p.teams_link
       FROM users u JOIN teacher_profiles p ON p.user_id = u.id
      WHERE u.role = 'teacher' AND u.status = 'active' AND u.archived_at IS NULL
        AND p.approved_at IS NOT NULL AND p.accepting AND (p.teams_link IS NOT NULL OR $3)
        AND $1::subject_code = ANY(p.subjects) AND $2 BETWEEN p.min_grade AND p.max_grade
      ORDER BY u.full_name`,
    [subject, grade, teamsAutoConfigured()],
  );
}

/** Days the parent may pick from, bounded by the subscription window. */
export function bookableDays(sub: Sub, now = new Date()): string[] {
  if (!sub.starts_at || !sub.ends_at) return [];
  const startKey = riyadhDateKey(new Date(Math.max(now.getTime(), sub.starts_at.getTime())));
  const lastKey = riyadhDateKey(new Date(Math.min(sub.ends_at.getTime() - 1, now.getTime() + BOOKING_HORIZON_DAYS * 86400_000)));
  const days: string[] = [];
  for (let k = startKey; k <= lastKey; k = addDaysKey(k, 1)) days.push(k);
  return days;
}

export type SlotMap = Map<number, string[]>; // start minute (Riyadh) → teacher ids free then

/**
 * Free start times on a given Riyadh day for a subject/grade.
 * Final safety is enforced by the DB exclusion constraints; this is the friendly preview.
 */
export async function availableSlots(opts: {
  sub: Sub; studentId: string; grade: number; subject: Subject; dateKey: string; now?: Date;
}): Promise<SlotMap> {
  const { sub, studentId, grade, subject, dateKey } = opts;
  const now = opts.now ?? new Date();
  const out: SlotMap = new Map();
  if (sub.status !== "active" || !sub.starts_at || !sub.ends_at) return out;

  const teachers = await eligibleTeachers(subject, grade);
  if (!teachers.length) return out;
  const ids = teachers.map((t) => t.id);
  const dayStart = riyadhToUtc(dateKey, 0);
  const dayEnd = riyadhToUtc(addDaysKey(dateKey, 1), 0);
  const weekday = weekdayOfKey(dateKey);

  const [rules, blocks, studentBusy] = await Promise.all([
    q<{ teacher_id: string; start_minute: number; end_minute: number }>(
      `SELECT teacher_id, start_minute, end_minute FROM availability_rules
        WHERE active AND weekday = $1 AND teacher_id = ANY($2::uuid[])`, [weekday, ids]),
    q<{ teacher_id: string; s: Date; e: Date }>(
      `SELECT teacher_id, starts_at AS s, ends_at AS e FROM bookings
        WHERE teacher_id = ANY($1::uuid[]) AND status <> 'rescheduled' AND starts_at < $3 AND ends_at > $2
       UNION ALL
       SELECT teacher_id, lower(during), upper(during) FROM availability_exceptions
        WHERE active AND teacher_id = ANY($1::uuid[]) AND during && tstzrange($2, $3)`,
      [ids, dayStart, dayEnd]),
    q<{ s: Date; e: Date }>(
      `SELECT starts_at AS s, ends_at AS e FROM bookings
        WHERE student_id = $1 AND status <> 'rescheduled' AND starts_at < $3 AND ends_at > $2`,
      [studentId, dayStart, dayEnd]),
  ]);

  const earliest = now.getTime() + MIN_LEAD_HOURS * 3600_000;
  const overlaps = (s: number, e: number, list: { s: Date; e: Date }[]) =>
    list.some((b) => s < b.e.getTime() && e > b.s.getTime());

  for (const rule of rules) {
    const busy = blocks.filter((b) => b.teacher_id === rule.teacher_id);
    for (let m = rule.start_minute; m + SESSION_MINUTES <= rule.end_minute; m += SLOT_STEP_MINUTES) {
      const s = riyadhToUtc(dateKey, m).getTime();
      const e = s + SESSION_MINUTES * 60_000;
      if (s < earliest) continue;
      if (s < sub.starts_at.getTime() || e > sub.ends_at.getTime()) continue;
      if (overlaps(s, e, busy) || overlaps(s, e, studentBusy)) continue;
      const list = out.get(m) ?? [];
      if (!list.includes(rule.teacher_id)) list.push(rule.teacher_id);
      out.set(m, list);
    }
  }
  return new Map([...out.entries()].sort((a, b) => a[0] - b[0]));
}

export async function subscriptionHeadroom(r: Runner, sub: Sub, startsAt: Date) {
  const used = await usedSessions(r, sub.id);
  const remaining = sub.sessions_total - used;
  const wk = weekStartKey(startsAt);
  const weekUsed = await weekUsage(r, sub.id, wk);
  return { remaining, weekUsed, weekAllowance: weeklyAllowance(sub, wk) };
}

/**
 * Admin reschedule: the old booking is kept (status 'rescheduled', linked via replaced_by)
 * and a new booking is created on the same subscription. Exclusion constraints still apply.
 */
export async function adminReschedule(input: {
  adminId: string; bookingId: string; teacherId: string; dateKey: string; startMinute: number; note?: string;
}) {
  const startsAt = riyadhToUtc(input.dateKey, input.startMinute);
  const endsAt = new Date(startsAt.getTime() + SESSION_MINUTES * 60_000);
  let oldEventId: string | null = null;
  try {
    const newId = await tx(async (c) => {
      const { rows } = await c.query<{
        id: string; subscription_id: string; parent_id: string; student_id: string; subject: Subject; track: Track;
        status: string; description: string; grade: number;
      }>(
        `SELECT b.*, st.grade FROM bookings b JOIN students st ON st.id = b.student_id WHERE b.id = $1 FOR UPDATE OF b`,
        [input.bookingId],
      );
      const old = rows[0];
      if (!old) throw new BookingError("الحصة غير موجودة.");
      if (old.status === "rescheduled") throw new BookingError("هذه الحصة أعيدت جدولتها من قبل.");
      const auto = teamsAutoConfigured();
      const { rows: t } = await c.query<{ teams_link: string | null }>(
        `SELECT p.teams_link FROM users u JOIN teacher_profiles p ON p.user_id = u.id
          WHERE u.id = $1 AND u.role = 'teacher' AND u.status = 'active' AND p.approved_at IS NOT NULL
            AND (p.teams_link IS NOT NULL OR $3) AND $2::subject_code = ANY(p.subjects)`,
        [input.teacherId, old.subject, auto],
      );
      if (!t[0]) throw new BookingError("المعلمة المختارة لا تدرّس هذه المادة أو ليس لديها رابط Teams.");
      oldEventId = (await c.query<{ teams_event_id: string | null }>(`SELECT teams_event_id FROM bookings WHERE id = $1`, [old.id])).rows[0]?.teams_event_id ?? null;

      await c.query(`UPDATE bookings SET status = 'rescheduled' WHERE id = $1`, [old.id]);
      const { rows: ins } = await c.query<{ id: string }>(
        `INSERT INTO bookings (subscription_id, parent_id, student_id, teacher_id, subject, track, starts_at, ends_at,
                               description, teams_link, teams_source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [old.subscription_id, old.parent_id, old.student_id, input.teacherId, old.subject, old.track, startsAt, endsAt,
         old.description, t[0].teams_link ?? "", auto ? "pending" : "teacher_link", input.adminId],
      );
      await c.query(`UPDATE bookings SET replaced_by = $2 WHERE id = $1`, [old.id, ins[0].id]);
      await audit("booking.reschedule", "booking", old.id, input.adminId,
        { new_booking: ins[0].id, starts_at: startsAt.toISOString(), note: input.note ?? null }, c);
      await queueRescheduleEmails(c, ins[0].id);
      return ins[0].id;
    });
    // Teams: new meeting for the new time, cancel the old one (best effort)
    await ensureBookingMeeting(newId).catch(() => false);
    if (oldEventId) await cancelMeeting(oldEventId, input.bookingId).catch(() => false);
    await kickOutbox();
    return newId;
  } catch (e) {
    if (isExclusionViolation(e)) throw new BookingError("الموعد الجديد يتعارض مع حصة أخرى للمعلمة أو الطالب.");
    throw e;
  }
}

/**
 * Creates a booking atomically. Throws BookingError with an Arabic, user-facing message.
 * Concurrency: the subscription row is locked FOR UPDATE (serializes credit usage),
 * and the EXCLUDE constraints make teacher/student overlap impossible even under races.
 */
export async function createBooking(input: {
  actorId: string; parentId: string; subscriptionId: string; studentId: string;
  teacherId: string; subject: Subject; dateKey: string; startMinute: number; description: string;
}) {
  const startsAt = riyadhToUtc(input.dateKey, input.startMinute);
  const endsAt = new Date(startsAt.getTime() + SESSION_MINUTES * 60_000);

  try {
    const id = await tx(async (c) => {
      const { rows: subs } = await c.query<Sub>(
        `SELECT * FROM subscriptions WHERE id = $1 AND parent_id = $2 FOR UPDATE`,
        [input.subscriptionId, input.parentId],
      );
      const sub = subs[0];
      if (!sub) throw new BookingError("الاشتراك غير موجود.");
      if (sub.status !== "active") throw new BookingError("الاشتراك غير مفعّل بعد.");
      if (sub.student_id !== input.studentId) throw new BookingError("هذا الاشتراك لطالب آخر.");
      if (sub.subject && sub.subject !== input.subject) throw new BookingError("هذه المادة غير مشمولة في الاشتراك.");
      if (!sub.starts_at || !sub.ends_at || startsAt < sub.starts_at || endsAt > sub.ends_at)
        throw new BookingError("الموعد خارج فترة الاشتراك.");
      if (startsAt.getTime() < Date.now() + MIN_LEAD_HOURS * 3600_000)
        throw new BookingError(`الحجز يكون قبل الموعد بـ${MIN_LEAD_HOURS} ساعات على الأقل.`);
      if (input.startMinute % SLOT_STEP_MINUTES !== 0) throw new BookingError("وقت غير صالح.");

      const head = await subscriptionHeadroom(c, sub, startsAt);
      if (head.remaining <= 0) throw new BookingError("استخدمت كل حصص الاشتراك.");
      if (head.weekUsed >= head.weekAllowance)
        throw new BookingError("وصلت للحد الأسبوعي من الحصص في هذا الأسبوع. اختر أسبوعاً آخر.");

      const { rows: st } = await c.query<{ grade: number }>(
        `SELECT grade FROM students WHERE id = $1 AND parent_id = $2 AND archived_at IS NULL`,
        [input.studentId, input.parentId],
      );
      if (!st[0]) throw new BookingError("الطالب غير موجود.");

      // Teacher must be eligible and available by her weekly schedule at this time
      const auto = teamsAutoConfigured();
      const { rows: t } = await c.query<{ teams_link: string | null }>(
        `SELECT p.teams_link FROM users u JOIN teacher_profiles p ON p.user_id = u.id
          WHERE u.id = $1 AND u.role = 'teacher' AND u.status = 'active' AND u.archived_at IS NULL
            AND p.approved_at IS NOT NULL AND p.accepting AND (p.teams_link IS NOT NULL OR $4)
            AND $2::subject_code = ANY(p.subjects) AND $3 BETWEEN p.min_grade AND p.max_grade`,
        [input.teacherId, input.subject, st[0].grade, auto],
      );
      if (!t[0]) throw new BookingError("المعلمة غير متاحة لهذه المادة أو الصف.");

      const p = riyadhParts(startsAt);
      const { rows: rule } = await c.query(
        `SELECT 1 FROM availability_rules WHERE teacher_id = $1 AND active AND weekday = $2
            AND start_minute <= $3 AND end_minute >= $4 LIMIT 1`,
        [input.teacherId, p.weekday, p.minutes, p.minutes + SESSION_MINUTES],
      );
      if (!rule[0]) throw new BookingError("هذا الوقت خارج جدول المعلمة.");
      const { rows: off } = await c.query(
        `SELECT 1 FROM availability_exceptions WHERE teacher_id = $1 AND active AND during && tstzrange($2,$3) LIMIT 1`,
        [input.teacherId, startsAt, endsAt],
      );
      if (off[0]) throw new BookingError("المعلمة في إجازة بهذا الوقت.");

      const { rows: ins } = await c.query<{ id: string }>(
        `INSERT INTO bookings (subscription_id, parent_id, student_id, teacher_id, subject, track,
                               starts_at, ends_at, description, teams_link, teams_source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
        [sub.id, input.parentId, input.studentId, input.teacherId, input.subject, sub.track,
         startsAt, endsAt, input.description.slice(0, 1000), t[0].teams_link ?? "", auto ? "pending" : "teacher_link", input.actorId],
      );
      await audit("booking.create", "booking", ins[0].id, input.actorId,
        { teacher: input.teacherId, starts_at: startsAt.toISOString(), subscription: sub.id }, c);
      await queueBookingEmails(c, ins[0].id);
      return ins[0].id;
    });
    await kickOutbox();
    return id;
  } catch (e) {
    if (isExclusionViolation(e)) {
      throw new BookingError("هذا الوقت انحجز للتو أو يتعارض مع حصة أخرى. اختر وقتاً آخر.");
    }
    throw e;
  }
}
