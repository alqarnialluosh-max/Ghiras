import "server-only";
import { audit } from "./audit";
import { makeReference } from "./crypto";
import { isUniqueViolation, pool, tx } from "./db";
import { enqueueForUser, firstName } from "./email";
import { getPlans } from "./plans";
import { dateLabel } from "./time";

/** How many days before the end we prepare the renewal and email the parent. */
export const RENEW_NOTICE_DAYS = 3;

/**
 * Phase 1 auto-renewal (until Salla recurring charges are approved):
 *  - auto_renew on  → create the next subscription as pending (renewal_of = current) and email the payment link.
 *                     Paying it extends the plan from the day the current one ends (see activateSubscription).
 *  - auto_renew off → one "your plan ends on…" notice.
 * Idempotent: at most one live renewal per subscription; notices are de-duplicated.
 */
export async function processRenewals() {
  const out = { renewals: 0, notices: 0, voided: 0 };
  const plans = await getPlans(true);
  const due = await pool.query<{
    id: string; parent_id: string; student_id: string; plan_code: string; subject: string | null; track: string;
    auto_renew: boolean; ends_at: Date; renewal_noticed_at: Date | null; student: string;
  }>(
    `SELECT s.id, s.parent_id, s.student_id, s.plan_code, s.subject, s.track, s.auto_renew, s.ends_at, s.renewal_noticed_at,
            st.full_name AS student
       FROM subscriptions s JOIN plans p ON p.code = s.plan_code JOIN students st ON st.id = s.student_id
      WHERE s.status = 'active' AND p.renewable AND st.archived_at IS NULL
        AND s.ends_at > now() AND s.ends_at <= now() + make_interval(days => $1)
        AND NOT EXISTS (SELECT 1 FROM subscriptions r WHERE r.renewal_of = s.id AND r.status <> 'void')`,
    [RENEW_NOTICE_DAYS]);

  for (const s of due.rows) {
    const plan = plans.find((p) => p.code === s.plan_code);
    const common = { student: firstName(s.student), plan: plan?.name_ar ?? "", date: dateLabel(s.ends_at) };
    if (s.auto_renew && plan?.active) {
      try {
        await tx(async (c) => {
          const { rows } = await c.query<{ id: string; reference: string }>(
            `INSERT INTO subscriptions (reference, parent_id, student_id, plan_code, subject, track, price_sar, sessions_total,
                                        weekly_limit, bonus_sessions, duration_days, auto_renew, renewal_of)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,true,$12) RETURNING id, reference`,
            [makeReference(), s.parent_id, s.student_id, plan.code, s.subject, s.track, plan.price_sar,
             plan.sessions_count + plan.bonus_sessions, plan.weekly_limit, plan.bonus_sessions, plan.duration_days, s.id]);
          await audit("subscription.renewal_create", "subscription", rows[0].id, null, { of: s.id }, c);
          await enqueueForUser(c, s.parent_id, "renewal_due", {
            ...common, price: Number(plan.price_sar).toLocaleString("en-US", { maximumFractionDigits: 0 }),
            reference: rows[0].reference, link: plan.salla_url ?? "",
          }, `renewal_due:${rows[0].id}`);
        });
        out.renewals++;
      } catch (e) {
        if (!isUniqueViolation(e)) throw e; // another runner created it first
      }
    } else if (!s.renewal_noticed_at) {
      await tx(async (c) => {
        const { rowCount } = await c.query(
          `UPDATE subscriptions SET renewal_noticed_at = now() WHERE id = $1 AND renewal_noticed_at IS NULL`, [s.id]);
        if (rowCount) await enqueueForUser(c, s.parent_id, "plan_ending", common, `plan_ending:${s.id}`);
      });
      out.notices++;
    }
  }

  // Unpaid renewals two weeks after the previous plan ended are closed (kept as void, never deleted).
  const v = await pool.query(
    `UPDATE subscriptions r SET status = 'void', activation_note = 'لم يُدفع التجديد'
       FROM subscriptions prev
      WHERE r.renewal_of = prev.id AND r.status = 'pending_payment' AND prev.ends_at < now() - interval '14 days'`);
  out.voided = v.rowCount ?? 0;
  return out;
}

export class RenewError extends Error {}

/** Parent turns auto-renewal on or off. Turning it off cancels an unpaid renewal (kept as void). */
export async function setAutoRenew(parentId: string, subId: string, on: boolean) {
  return tx(async (c) => {
    const { rows } = await c.query<{ id: string; renewable: boolean; status: string }>(
      `SELECT s.id, p.renewable, s.status FROM subscriptions s JOIN plans p ON p.code = s.plan_code
        WHERE s.id = $1 AND s.parent_id = $2 FOR UPDATE OF s`, [subId, parentId]);
    const s = rows[0];
    if (!s) throw new RenewError("الاشتراك غير موجود.");
    if (!s.renewable) throw new RenewError("هذه الباقة لمرة واحدة ولا تتجدد.");
    if (s.status !== "active" && s.status !== "pending_payment") throw new RenewError("انتهى هذا الاشتراك.");
    await c.query(`UPDATE subscriptions SET auto_renew = $2, auto_renew_changed_at = now() WHERE id = $1`, [subId, on]);
    if (!on) {
      await c.query(
        `UPDATE subscriptions SET status = 'void', activation_note = 'أوقف ولي الأمر التجديد التلقائي'
          WHERE renewal_of = $1 AND status = 'pending_payment'`, [subId]);
    }
    await audit(on ? "subscription.auto_renew_on" : "subscription.auto_renew_off", "subscription", subId, parentId, {}, c);
  });
}
