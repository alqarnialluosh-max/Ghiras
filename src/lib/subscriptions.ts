import "server-only";
import { enqueueAdmin, enqueueForUser, firstName } from "./email";
import type { PoolClient } from "pg";
import { audit } from "./audit";
import { postSubscriptionIncome } from "./accounting";
import { makeReference } from "./crypto";
import { one, q, tx, isUniqueViolation } from "./db";
import type { Subject, Track } from "./domain";
import { usedSessions } from "./booking";
import { pool } from "./db";

export type SubscriptionRow = {
  id: string; reference: string; parent_id: string; student_id: string; plan_code: string;
  subject: Subject | null; track: Track; status: "pending_payment" | "active" | "expired" | "void";
  price_sar: string; sessions_total: number; weekly_limit: number | null; bonus_sessions: number;
  duration_days: number; starts_at: Date | null; ends_at: Date | null; salla_order_id: string | null;
  created_at: Date; plan_name: string; student_name: string; grade: number;
  auto_renew: boolean; renewal_of: string | null; renewable: boolean;
};

/** Marks subscriptions whose window ended as expired (idempotent, cheap). */
export async function expireOverdue() {
  await q(`UPDATE subscriptions SET status = 'expired' WHERE status = 'active' AND ends_at < now()`);
}

export async function createPendingSubscription(input: {
  parentId: string; studentId: string; planCode: string; subject: Subject | null; track: Track;
}) {
  return tx(async (c) => {
    const { rows: plans } = await c.query<{
      code: string; price_sar: string; sessions_count: number; bonus_sessions: number;
      weekly_limit: number | null; duration_days: number; all_subjects: boolean; renewable: boolean;
    }>(`SELECT * FROM plans WHERE code = $1 AND active`, [input.planCode]);
    const plan = plans[0];
    if (!plan) throw new Error("PLAN_NOT_FOUND");
    const subject = plan.all_subjects ? null : input.subject;
    if (!plan.all_subjects && !subject) throw new Error("SUBJECT_REQUIRED");

    const { rows: st } = await c.query(`SELECT 1 FROM students WHERE id = $1 AND parent_id = $2 AND archived_at IS NULL`,
      [input.studentId, input.parentId]);
    if (!st[0]) throw new Error("STUDENT_NOT_FOUND");

    // Reuse an identical pending request from the last 48h instead of piling up duplicates
    const { rows: existing } = await c.query<{ id: string; reference: string }>(
      `SELECT id, reference FROM subscriptions
        WHERE parent_id = $1 AND student_id = $2 AND plan_code = $3 AND subject IS NOT DISTINCT FROM $4
          AND track = $5 AND status = 'pending_payment' AND created_at > now() - interval '48 hours'
        ORDER BY created_at DESC LIMIT 1`,
      [input.parentId, input.studentId, plan.code, subject, input.track],
    );
    if (existing[0]) return existing[0];

    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { rows } = await c.query<{ id: string; reference: string }>(
          `INSERT INTO subscriptions (reference, parent_id, student_id, plan_code, subject, track, price_sar,
                                      sessions_total, weekly_limit, bonus_sessions, duration_days, auto_renew)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id, reference`,
          [makeReference(), input.parentId, input.studentId, plan.code, subject, input.track, plan.price_sar,
           plan.sessions_count + plan.bonus_sessions, plan.weekly_limit, plan.bonus_sessions, plan.duration_days, plan.renewable],
        );
        await audit("subscription.create", "subscription", rows[0].id, input.parentId, { plan: plan.code }, c);
        return rows[0];
      } catch (e) {
        if (isUniqueViolation(e) && attempt < 4) continue; // reference collision, retry
        throw e;
      }
    }
    throw new Error("REFERENCE_FAILED");
  });
}

/**
 * Activates a pending subscription. The window starts now — or, for a renewal paid while the
 * previous subscription is still running, right when the previous one ends (no lost days).
 */
export async function activateSubscription(
  c: PoolClient, subId: string, opts: { orderId?: string | null; actorId?: string | null; note?: string },
) {
  const { rows } = await c.query<{ id: string }>(
    `WITH st AS (
       SELECT GREATEST(now(), COALESCE((SELECT prev.ends_at FROM subscriptions prev
                                         WHERE prev.id = s.renewal_of AND prev.status = 'active'), now())) AS t
         FROM subscriptions s WHERE s.id = $1)
     UPDATE subscriptions
        SET status = 'active', starts_at = (SELECT t FROM st), ends_at = (SELECT t FROM st) + make_interval(days => duration_days),
            salla_order_id = COALESCE($2, salla_order_id), activated_by = $3, activation_note = $4
      WHERE id = $1 AND status = 'pending_payment'
      RETURNING id`,
    [subId, opts.orderId ?? null, opts.actorId ?? null, opts.note ?? null],
  );
  if (!rows[0]) return false;
  await postSubscriptionIncome(c, subId); // accounting: income (+ estimated Salla fee)
  await audit("subscription.activate", "subscription", subId, opts.actorId ?? null,
    { order: opts.orderId ?? null, via: opts.actorId ? "admin" : "salla_webhook" }, c);
  const { rows: info } = await c.query<{ parent_id: string; parent_name: string; plan: string; student: string; reference: string }>(
    `SELECT s.parent_id, u.full_name parent_name, p.name_ar plan, st.full_name student, s.reference
       FROM subscriptions s JOIN users u ON u.id = s.parent_id JOIN plans p ON p.code = s.plan_code JOIN students st ON st.id = s.student_id
      WHERE s.id = $1`, [subId]);
  if (info[0]) {
    const i = info[0];
    await enqueueForUser(c, i.parent_id, "subscription_active",
      { plan: i.plan, student: firstName(i.student), reference: i.reference }, `sub_active:${subId}`);
    await enqueueAdmin(c, "admin_new_subscription", { name: i.parent_name, plan: i.plan, reference: i.reference }, `admin_sub:${subId}`);
  }
  return true;
}

export async function parentSubscriptions(parentId: string) {
  await expireOverdue();
  return q<SubscriptionRow>(
    `SELECT s.*, p.name_ar AS plan_name, p.renewable, st.full_name AS student_name, st.grade
       FROM subscriptions s JOIN plans p ON p.code = s.plan_code JOIN students st ON st.id = s.student_id
      WHERE s.parent_id = $1 AND s.status <> 'void'
      ORDER BY (s.status = 'active') DESC, s.created_at DESC`,
    [parentId],
  );
}

export async function remainingFor(subId: string, total: number) {
  return total - (await usedSessions(pool, subId));
}

export async function getSubscriptionForParent(subId: string, parentId: string) {
  return one<SubscriptionRow>(
    `SELECT s.*, p.name_ar AS plan_name, p.renewable, st.full_name AS student_name, st.grade
       FROM subscriptions s JOIN plans p ON p.code = s.plan_code JOIN students st ON st.id = s.student_id
      WHERE s.id = $1 AND s.parent_id = $2`,
    [subId, parentId],
  );
}
