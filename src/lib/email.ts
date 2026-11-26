import "server-only";
import type { PoolClient } from "pg";
import { site } from "@/config/site";
import { one, pool, q } from "./db";
import { randomToken, sha256 } from "./crypto";
import { GRADES, SUBJECTS, type Subject } from "./domain";
import { TEMPLATES, absUrl } from "./email-templates";
import { dateLabel, timeLabel } from "./time";

type Runner = Pick<PoolClient, "query">;

/**
 * Three modes:
 * - off:        no RESEND_API_KEY.
 * - owner_only: key but no EMAIL_FROM (no verified domain yet). Resend's shared test sender can only
 *               reach the address the Resend account was opened with, so only owner alerts go out.
 * - full:       key + EMAIL_FROM on a verified domain: everything, and email verification is enforced.
 */
export type EmailMode = "off" | "owner_only" | "full";
export function emailMode(): EmailMode {
  if (!process.env.RESEND_API_KEY) return "off";
  return process.env.EMAIL_FROM ? "full" : "owner_only";
}
export function emailConfigured() { return emailMode() === "full"; }
export function adminRecipient() { return (process.env.EMAIL_ADMIN_TO || process.env.OWNER_EMAIL || "").trim().toLowerCase(); }
const TEST_SENDER = "Ghiras <onboarding@resend.dev>";
/** Can this address receive mail in the current mode? */
export function canSendTo(to: string) {
  const mode = emailMode();
  return mode === "full" || (mode === "owner_only" && !!adminRecipient() && to.trim().toLowerCase() === adminRecipient());
}
const API = () => (process.env.RESEND_API_BASE ?? "https://api.resend.com").replace(/\/$/, "");
const MAX_ATTEMPTS = 5;

type Delivery = { ok: true; id: string } | { ok: false; error: string; retry: boolean };

async function deliver(to: string, template: string, params: Record<string, string>, idempotencyKey: string): Promise<Delivery> {
  const render = TEMPLATES[template];
  if (!render) return { ok: false, error: `unknown template ${template}`, retry: false };
  const r = render(params);
  try {
    const res = await fetch(`${API()}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey, // Resend drops a repeat with the same key, so a retry never sends twice
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || TEST_SENDER, to: [to], subject: r.subject, html: r.html, text: r.text,
        reply_to: process.env.EMAIL_REPLY_TO || site.contact.email,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await res.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
    if (res.ok && body.id) return { ok: true, id: body.id };
    const error = `${res.status} ${body.name ?? ""} ${body.message ?? ""}`.trim().slice(0, 300);
    return { ok: false, error, retry: res.status === 429 || res.status >= 500 };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 300), retry: true };
  }
}

/** Queue an email inside the caller's transaction; it goes out only if that transaction commits. */
export async function enqueue(c: Runner, m: {
  userId?: string | null; to: string; template: string; params?: Record<string, string>; dedupeKey?: string; sendAfter?: Date;
}) {
  await c.query(
    `INSERT INTO email_outbox (user_id, to_email, template, params, dedupe_key, send_after)
     VALUES ($1,$2,$3,$4,$5,COALESCE($6, now())) ON CONFLICT (dedupe_key) DO NOTHING`,
    [m.userId ?? null, m.to, m.template, JSON.stringify(m.params ?? {}), m.dedupeKey ?? null, m.sendAfter ?? null],
  );
}

/** Queue for a user by id (looks up address and first name). */
export async function enqueueForUser(c: Runner, userId: string, template: string, params: Record<string, string>, dedupeKey?: string) {
  const { rows } = await c.query<{ email: string; full_name: string }>(`SELECT email, full_name FROM users WHERE id = $1`, [userId]);
  if (!rows[0]) return;
  await enqueue(c, { userId, to: rows[0].email, template, params: { name: firstName(rows[0].full_name), ...params }, dedupeKey });
}

/** Owner alerts go to OWNER_EMAIL (or EMAIL_ADMIN_TO). */
export async function enqueueAdmin(c: Runner, template: string, params: Record<string, string>, dedupeKey?: string) {
  const to = adminRecipient();
  if (to) await enqueue(c, { to, template, params, dedupeKey });
}

export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;

/** Send what's due. Rows are leased first, so two runners never send the same row. */
export async function dispatchOutbox(limit = 25) {
  const { rows } = await pool.query<{ id: string; to_email: string; template: string; params: Record<string, string>; attempts: number }>(
    `UPDATE email_outbox SET attempts = attempts + 1, send_after = now() + interval '10 minutes'
      WHERE id IN (SELECT id FROM email_outbox WHERE status = 'queued' AND send_after <= now()
                    ORDER BY send_after LIMIT $1 FOR UPDATE SKIP LOCKED)
      RETURNING id, to_email, template, params, attempts`, [limit]);
  let sent = 0, failed = 0;
  for (const row of rows) {
    if (!canSendTo(row.to_email)) {
      const why = emailMode() === "off" ? "البريد غير مفعّل" : "يحتاج دوميناً موثّقاً للإرسال لغير المالك";
      await q(`UPDATE email_outbox SET status = 'skipped', error = $2 WHERE id = $1`, [row.id, why]);
      continue;
    }
    const d = await deliver(row.to_email, row.template, row.params, row.id);
    if (d.ok) {
      sent++;
      await q(`UPDATE email_outbox SET status = 'sent', provider_id = $2, sent_at = now(), error = NULL WHERE id = $1`, [row.id, d.id]);
    } else {
      failed++;
      const final = !d.retry || row.attempts >= MAX_ATTEMPTS;
      await q(`UPDATE email_outbox SET status = $2, error = $3, send_after = now() + make_interval(mins => $4) WHERE id = $1`,
        [row.id, final ? "failed" : "queued", d.error, row.attempts * row.attempts * 5]);
    }
  }
  return { picked: rows.length, sent, failed };
}

// ------------------------------------------------------------------ one-time links

const TOKEN_TTL = { verify: 48 * 60, reset: 60 } as const; // minutes
export type TokenPurpose = keyof typeof TOKEN_TTL;

/**
 * Create a one-time link and send it right away (not via the queue, so the raw token is never stored).
 * The outbox row records that it was sent, without the link.
 */
export async function sendTokenEmail(userId: string, purpose: TokenPurpose): Promise<{ ok: boolean; error?: string }> {
  const user = await one<{ email: string; full_name: string }>(`SELECT email, full_name FROM users WHERE id = $1`, [userId]);
  if (!user) return { ok: false, error: "no user" };
  const raw = randomToken(32);
  const outboxId = await pool.connect().then(async (c) => {
    try {
      await c.query("BEGIN");
      // a new reset link retires older unused ones
      if (purpose === "reset") await c.query(`UPDATE email_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'reset' AND used_at IS NULL`, [userId]);
      await c.query(`INSERT INTO email_tokens (user_id, purpose, token_hash, email, expires_at) VALUES ($1,$2,$3,$4, now() + make_interval(mins => $5))`,
        [userId, purpose, sha256(raw), user.email, TOKEN_TTL[purpose]]);
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO email_outbox (user_id, to_email, template, params, status, attempts) VALUES ($1,$2,$3,$4,'queued',1) RETURNING id`,
        [userId, user.email, purpose === "verify" ? "verify_email" : "reset_password", JSON.stringify({ name: firstName(user.full_name) })]);
      await c.query("COMMIT");
      return rows[0].id;
    } catch (e) { await c.query("ROLLBACK"); throw e; } finally { c.release(); }
  });
  if (!emailConfigured()) {
    await q(`UPDATE email_outbox SET status = 'skipped', error = 'البريد غير مفعّل' WHERE id = $1`, [outboxId]);
    return { ok: false, error: "not configured" };
  }
  const path = purpose === "verify" ? "/verify-email" : "/reset-password";
  const d = await deliver(user.email, purpose === "verify" ? "verify_email" : "reset_password",
    { name: firstName(user.full_name), link: absUrl(`${path}?token=${encodeURIComponent(raw)}`) }, outboxId);
  await q(d.ok
    ? `UPDATE email_outbox SET status = 'sent', provider_id = $2, sent_at = now() WHERE id = $1`
    : `UPDATE email_outbox SET status = 'failed', error = $2 WHERE id = $1`, [outboxId, d.ok ? d.id : d.error]);
  return d.ok ? { ok: true } : { ok: false, error: d.error };
}

/** Is this link still usable? (No side effects — the reset page checks before showing its form.) */
export async function peekToken(purpose: TokenPurpose, raw: string) {
  if (!raw || raw.length > 100) return null;
  return one<{ user_id: string }>(
    `SELECT t.user_id FROM email_tokens t JOIN users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.purpose = $2 AND t.used_at IS NULL AND t.expires_at > now() AND u.email = t.email`,
    [sha256(raw), purpose]);
}

/** Use a link once. Returns the user it belongs to, or null if invalid / expired / already used / email changed since. */
export async function consumeToken(c: Runner, purpose: TokenPurpose, raw: string) {
  if (!raw || raw.length > 100) return null;
  const { rows } = await c.query<{ user_id: string }>(
    `UPDATE email_tokens t SET used_at = now() FROM users u
      WHERE u.id = t.user_id AND t.token_hash = $1 AND t.purpose = $2 AND t.used_at IS NULL AND t.expires_at > now() AND u.email = t.email
      RETURNING t.user_id`, [sha256(raw), purpose]);
  return rows[0] ?? null;
}

// ------------------------------------------------------------------ session emails

type BookingRow = {
  id: string; subject: Subject; starts_at: Date; grade: number; student_name: string;
  parent_id: string; parent_email: string; parent_name: string; teacher_id: string; teacher_email: string; teacher_name: string;
};

async function bookingRow(c: Runner, bookingId: string) {
  const { rows } = await c.query<BookingRow>(
    `SELECT b.id, b.subject, b.starts_at, s.grade, s.full_name student_name,
            p.id parent_id, p.email parent_email, p.full_name parent_name, t.id teacher_id, t.email teacher_email, t.full_name teacher_name
       FROM bookings b JOIN students s ON s.id = b.student_id JOIN users p ON p.id = b.parent_id JOIN users t ON t.id = b.teacher_id
      WHERE b.id = $1`, [bookingId]);
  return rows[0];
}

const common = (b: BookingRow) => ({
  booking: b.id, subject: SUBJECTS[b.subject], student: firstName(b.student_name), grade: GRADES[b.grade] ?? "",
  teacher: b.teacher_name, date: dateLabel(b.starts_at), time: timeLabel(b.starts_at),
});

export async function queueBookingEmails(c: Runner, bookingId: string) {
  const b = await bookingRow(c, bookingId);
  if (!b) return;
  await enqueue(c, { userId: b.parent_id, to: b.parent_email, template: "booking_parent", params: common(b), dedupeKey: `booked:${b.id}:parent` });
  await enqueue(c, { userId: b.teacher_id, to: b.teacher_email, template: "booking_teacher",
    params: { ...common(b), name: firstName(b.teacher_name) }, dedupeKey: `booked:${b.id}:teacher` });
}

export async function queueRescheduleEmails(c: Runner, newBookingId: string) {
  const b = await bookingRow(c, newBookingId);
  if (!b) return;
  await enqueue(c, { userId: b.parent_id, to: b.parent_email, template: "rescheduled",
    params: { ...common(b), path: `/parent/sessions/${b.id}` }, dedupeKey: `resched:${b.id}:parent` });
  await enqueue(c, { userId: b.teacher_id, to: b.teacher_email, template: "rescheduled",
    params: { ...common(b), path: `/teacher/sessions/${b.id}` }, dedupeKey: `resched:${b.id}:teacher` });
}

export async function queueReportEmail(c: Runner, bookingId: string) {
  const b = await bookingRow(c, bookingId);
  if (!b) return;
  await enqueue(c, { userId: b.parent_id, to: b.parent_email, template: "report_ready", params: common(b), dedupeKey: `report:${b.id}` });
}

/** Reminder to both sides about two hours before each session (run by the background job). */
export async function queueReminders() {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT b.id FROM bookings b
      WHERE b.status = 'scheduled' AND b.starts_at > now() + interval '10 minutes' AND b.starts_at <= now() + interval '2 hours 15 minutes'
        AND NOT EXISTS (SELECT 1 FROM email_outbox o WHERE o.dedupe_key = 'remind:' || b.id || ':parent')`);
  for (const r of rows) {
    const b = await bookingRow(pool, r.id);
    if (!b) continue;
    await enqueue(pool, { userId: b.parent_id, to: b.parent_email, template: "reminder",
      params: { ...common(b), role: "parent", path: `/parent/sessions/${b.id}` }, dedupeKey: `remind:${b.id}:parent` });
    await enqueue(pool, { userId: b.teacher_id, to: b.teacher_email, template: "reminder",
      params: { ...common(b), role: "teacher", path: `/teacher/sessions/${b.id}` }, dedupeKey: `remind:${b.id}:teacher` });
  }
  return rows.length;
}

/** Send queued mail right after the response (falls back to fire-and-forget outside a request). */
export async function kickOutbox() {
  const run = () => dispatchOutbox().then(() => undefined).catch(() => undefined);
  try {
    const { after } = await import("next/server");
    after(run);
  } catch {
    void run();
  }
}

/** Queue a booking-related template to the parent or the teacher of a booking. */
export async function queueForBooking(c: Runner, bookingId: string, to: "parent" | "teacher", template: string,
  extra: Record<string, string> = {}, dedupe = `${template}:${bookingId}:${to}`) {
  const b = await bookingRow(c, bookingId);
  if (!b) return;
  const params = { ...common(b), ...(to === "teacher" ? { name: firstName(b.teacher_name) } : {}), ...extra };
  await enqueue(c, to === "parent"
    ? { userId: b.parent_id, to: b.parent_email, template, params, dedupeKey: dedupe }
    : { userId: b.teacher_id, to: b.teacher_email, template, params, dedupeKey: dedupe });
}

/** New request: the teacher must answer; the parent gets a receipt. */
export async function queueRequestEmails(c: Runner, bookingId: string) {
  const { TEACHER_RESPONSE_HOURS } = await import("./domain");
  const hours = String(TEACHER_RESPONSE_HOURS);
  await queueForBooking(c, bookingId, "teacher", "request_teacher", { hours });
  await queueForBooking(c, bookingId, "parent", "request_parent", { hours });
}
