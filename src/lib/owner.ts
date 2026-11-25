import "server-only";
import { one, q } from "./db";
import { env } from "./env";
import { PAYABLE } from "./teachers";

const MONTH_NOW = `date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')`;
const monthOf = (col: string) => `date_trunc('month', ${col} AT TIME ZONE 'Asia/Riyadh')`;

export async function ownerOverview() {
  const rate = env.teacherRateSar;
  const c = await one<{
    parents: string; parents_new_month: string; parents_active: string;
    teachers_active: string; teachers_pending: string;
    subs_active: string; subs_pending: string; subs_paid_total: string; subs_paid_month: string;
    revenue_month: string; revenue_last_month: string; revenue_total: string;
    payable_month: string; payable_total: string; paid_total: string;
    upcoming: string; completed_month: string; student_absent_month: string; teacher_absent_month: string;
    unmatched: string;
  }>(`
    SELECT
      (SELECT count(*) FROM users WHERE role='parent') parents,
      (SELECT count(*) FROM users WHERE role='parent' AND ${monthOf("created_at")} = ${MONTH_NOW}) parents_new_month,
      (SELECT count(DISTINCT parent_id) FROM subscriptions WHERE status='active') parents_active,
      (SELECT count(*) FROM users WHERE role='teacher' AND status='active') teachers_active,
      (SELECT count(*) FROM users WHERE role='teacher' AND status='pending') teachers_pending,
      (SELECT count(*) FROM subscriptions WHERE status='active') subs_active,
      (SELECT count(*) FROM subscriptions WHERE status='pending_payment') subs_pending,
      (SELECT count(*) FROM subscriptions WHERE starts_at IS NOT NULL) subs_paid_total,
      (SELECT count(*) FROM subscriptions WHERE starts_at IS NOT NULL AND ${monthOf("starts_at")} = ${MONTH_NOW}) subs_paid_month,
      (SELECT coalesce(sum(price_sar),0) FROM subscriptions WHERE starts_at IS NOT NULL AND ${monthOf("starts_at")} = ${MONTH_NOW}) revenue_month,
      (SELECT coalesce(sum(price_sar),0) FROM subscriptions WHERE starts_at IS NOT NULL AND ${monthOf("starts_at")} = ${MONTH_NOW} - interval '1 month') revenue_last_month,
      (SELECT coalesce(sum(price_sar),0) FROM subscriptions WHERE starts_at IS NOT NULL) revenue_total,
      (SELECT count(*) FROM bookings WHERE status = ANY($1::booking_status[]) AND ${monthOf("starts_at")} = ${MONTH_NOW}) payable_month,
      (SELECT count(*) FROM bookings WHERE status = ANY($1::booking_status[])) payable_total,
      (SELECT coalesce(sum(amount_sar),0) FROM payouts) paid_total,
      (SELECT count(*) FROM bookings WHERE status='scheduled' AND ends_at >= now()) upcoming,
      (SELECT count(*) FROM bookings WHERE status='completed' AND ${monthOf("starts_at")} = ${MONTH_NOW}) completed_month,
      (SELECT count(*) FROM bookings WHERE status='student_absent' AND ${monthOf("starts_at")} = ${MONTH_NOW}) student_absent_month,
      (SELECT count(*) FROM bookings WHERE status='teacher_absent' AND ${monthOf("starts_at")} = ${MONTH_NOW}) teacher_absent_month,
      (SELECT count(*) FROM salla_events WHERE match_status='unmatched') unmatched`, [PAYABLE]);

  const n = (v?: string) => Number(v ?? 0);
  const revenueMonth = n(c?.revenue_month);
  const costMonth = n(c?.payable_month) * rate;
  const earnedTotal = n(c?.payable_total) * rate;
  return {
    rate,
    parents: n(c?.parents), parentsNewMonth: n(c?.parents_new_month), parentsActive: n(c?.parents_active),
    teachersActive: n(c?.teachers_active), teachersPending: n(c?.teachers_pending),
    subsActive: n(c?.subs_active), subsPending: n(c?.subs_pending), subsPaidTotal: n(c?.subs_paid_total), subsPaidMonth: n(c?.subs_paid_month),
    revenueMonth, revenueLastMonth: n(c?.revenue_last_month), revenueTotal: n(c?.revenue_total),
    costMonth, profitMonth: revenueMonth - costMonth,
    earnedTotal, paidTotal: n(c?.paid_total), outstanding: earnedTotal - n(c?.paid_total),
    upcoming: n(c?.upcoming), completedMonth: n(c?.completed_month),
    studentAbsentMonth: n(c?.student_absent_month), teacherAbsentMonth: n(c?.teacher_absent_month),
    unmatched: n(c?.unmatched),
  };
}

/** Active subscriptions and paid-ever counts per plan. */
export function subscribersByPlan() {
  return q<{ code: string; name_ar: string; price_sar: string; active: string; paid_month: string; paid_total: string; revenue_total: string }>(`
    SELECT p.code, p.name_ar, p.price_sar,
           count(s.*) FILTER (WHERE s.status = 'active') active,
           count(s.*) FILTER (WHERE s.starts_at IS NOT NULL AND ${monthOf("s.starts_at")} = ${MONTH_NOW}) paid_month,
           count(s.*) FILTER (WHERE s.starts_at IS NOT NULL) paid_total,
           coalesce(sum(s.price_sar) FILTER (WHERE s.starts_at IS NOT NULL), 0) revenue_total
      FROM plans p LEFT JOIN subscriptions s ON s.plan_code = p.code
     GROUP BY p.code, p.name_ar, p.price_sar, p.sort_order ORDER BY p.sort_order`);
}

/** Revenue vs teacher cost for the last N months (Riyadh months). */
export async function monthlyFinance(months = 6) {
  const rows = await q<{ month: string; revenue: string; subs: string; sessions: string }>(`
    WITH m AS (
      SELECT generate_series(${MONTH_NOW} - make_interval(months => $2 - 1), ${MONTH_NOW}, interval '1 month') AS month
    )
    SELECT to_char(m.month, 'YYYY-MM') AS month,
           (SELECT coalesce(sum(price_sar),0) FROM subscriptions s WHERE s.starts_at IS NOT NULL AND ${monthOf("s.starts_at")} = m.month) AS revenue,
           (SELECT count(*) FROM subscriptions s WHERE s.starts_at IS NOT NULL AND ${monthOf("s.starts_at")} = m.month) subs,
           (SELECT count(*) FROM bookings b WHERE b.status = ANY($1::booking_status[]) AND ${monthOf("b.starts_at")} = m.month) sessions
      FROM m ORDER BY m.month`, [PAYABLE, months]);
  const rate = env.teacherRateSar;
  return rows.map((r) => {
    const revenue = Number(r.revenue);
    const cost = Number(r.sessions) * rate;
    return { month: r.month, revenue, subs: Number(r.subs), sessions: Number(r.sessions), cost, profit: revenue - cost };
  });
}

export type TeacherStat = {
  id: string; full_name: string; email: string; status: string; approved: boolean; has_teams: boolean;
  completed: number; student_absent: number; teacher_absent: number; upcoming: number;
  payable_month: number; payable_total: number; earned_month: number; earned_total: number; paid: number; balance: number;
  last_session: Date | null;
};

/** Per-teacher sessions and money. Earned = payable sessions × rate; balance = earned − recorded payouts. */
export async function teacherStats(teacherId?: string): Promise<TeacherStat[]> {
  const rate = env.teacherRateSar;
  const rows = await q<{
    id: string; full_name: string; email: string; status: string; approved_at: Date | null; teams_link: string | null;
    completed: string; student_absent: string; teacher_absent: string; upcoming: string;
    payable_month: string; payable_total: string; paid: string; last_session: Date | null;
  }>(`
    SELECT u.id, u.full_name, u.email, u.status, p.approved_at, p.teams_link,
      count(b.*) FILTER (WHERE b.status = 'completed') completed,
      count(b.*) FILTER (WHERE b.status = 'student_absent') student_absent,
      count(b.*) FILTER (WHERE b.status = 'teacher_absent') teacher_absent,
      count(b.*) FILTER (WHERE b.status = 'scheduled' AND b.ends_at >= now()) upcoming,
      count(b.*) FILTER (WHERE b.status = ANY($1::booking_status[]) AND ${monthOf("b.starts_at")} = ${MONTH_NOW}) payable_month,
      count(b.*) FILTER (WHERE b.status = ANY($1::booking_status[])) payable_total,
      (SELECT coalesce(sum(amount_sar),0) FROM payouts po WHERE po.teacher_id = u.id) paid,
      max(b.starts_at) FILTER (WHERE b.status = ANY($1::booking_status[])) last_session
    FROM users u JOIN teacher_profiles p ON p.user_id = u.id
    LEFT JOIN bookings b ON b.teacher_id = u.id
    WHERE u.role = 'teacher' AND u.archived_at IS NULL ${teacherId ? "AND u.id = $2" : ""}
    GROUP BY u.id, u.full_name, u.email, u.status, p.approved_at, p.teams_link
    ORDER BY count(b.*) FILTER (WHERE b.status = ANY($1::booking_status[])) DESC, u.full_name`,
    teacherId ? [PAYABLE, teacherId] : [PAYABLE]);
  return rows.map((r) => {
    const earned_total = Number(r.payable_total) * rate;
    const paid = Number(r.paid);
    return {
      id: r.id, full_name: r.full_name, email: r.email, status: r.status, approved: !!r.approved_at, has_teams: !!r.teams_link,
      completed: Number(r.completed), student_absent: Number(r.student_absent), teacher_absent: Number(r.teacher_absent),
      upcoming: Number(r.upcoming), payable_month: Number(r.payable_month), payable_total: Number(r.payable_total),
      earned_month: Number(r.payable_month) * rate, earned_total, paid, balance: earned_total - paid, last_session: r.last_session,
    };
  });
}

export const sar = (v: number) => `${Math.round(v).toLocaleString("en-US")} ﷼`;
