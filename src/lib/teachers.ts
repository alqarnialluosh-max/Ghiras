import "server-only";
import { one, q } from "./db";
import type { Subject } from "./domain";

export type TeacherProfile = {
  user_id: string; full_name: string; email: string; status: string; bio: string; qualification: string;
  years_experience: number; subjects: Subject[]; min_grade: number; max_grade: number; teams_link: string | null;
  accepting: boolean; approved_at: Date | null; created_at: Date; cv_id: string | null; cv_name: string | null;
};

const PROFILE = `
  SELECT p.user_id, u.full_name, u.email, u.status, p.bio, p.qualification, p.years_experience,
         p.subjects::text[] AS subjects, p.min_grade, p.max_grade, p.teams_link, p.accepting, p.approved_at, u.created_at,
         cv.id AS cv_id, cv.filename AS cv_name
    FROM teacher_profiles p JOIN users u ON u.id = p.user_id
    LEFT JOIN LATERAL (SELECT id, filename FROM teacher_documents d WHERE d.teacher_id = p.user_id AND d.kind = 'cv'
                       ORDER BY d.created_at DESC LIMIT 1) cv ON true`;

export function teacherProfile(id: string) {
  return one<TeacherProfile>(`${PROFILE} WHERE p.user_id = $1`, [id]);
}

export function allTeachers() {
  return q<TeacherProfile>(`${PROFILE} WHERE u.archived_at IS NULL ORDER BY (u.status = 'pending') DESC, u.created_at DESC`);
}

/** Sessions that earn pay: the teacher showed up (completed, or the student was absent). */
export const PAYABLE = ["completed", "student_absent"];

/**
 * Per teacher and month: payable sessions, their pay (each session's frozen rate), and bonuses.
 * Months with only a bonus are included too.
 */
export function monthlyEarnings(teacherId?: string) {
  return q<{ teacher_id: string; teacher_name: string; month: string; sessions: string; session_pay: string; bonus: string; total: string; paid: boolean }>(
    `WITH s AS (
       SELECT b.teacher_id, to_char(date_trunc('month', b.starts_at AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM') AS month,
              count(*) AS sessions, coalesce(sum(b.teacher_rate_sar), 0) AS session_pay
         FROM bookings b WHERE b.status = ANY($1::booking_status[]) ${teacherId ? "AND b.teacher_id = $2" : ""} GROUP BY 1, 2),
     bo AS (
       SELECT teacher_id, to_char(period_month, 'YYYY-MM') AS month, sum(amount_sar) AS bonus
         FROM teacher_bonuses WHERE voided_at IS NULL ${teacherId ? "AND teacher_id = $2" : ""} GROUP BY 1, 2)
     SELECT coalesce(s.teacher_id, bo.teacher_id) AS teacher_id, u.full_name AS teacher_name, coalesce(s.month, bo.month) AS month,
            coalesce(s.sessions, 0) AS sessions, coalesce(s.session_pay, 0) AS session_pay, coalesce(bo.bonus, 0) AS bonus,
            coalesce(s.session_pay, 0) + coalesce(bo.bonus, 0) AS total,
            EXISTS (SELECT 1 FROM payouts po WHERE po.teacher_id = coalesce(s.teacher_id, bo.teacher_id)
                     AND to_char(po.period_start, 'YYYY-MM') = coalesce(s.month, bo.month)) AS paid
       FROM s FULL JOIN bo ON bo.teacher_id = s.teacher_id AND bo.month = s.month
       JOIN users u ON u.id = coalesce(s.teacher_id, bo.teacher_id)
      ORDER BY 3 DESC, 2`,
    teacherId ? [PAYABLE, teacherId] : [PAYABLE],
  );
}

export type BonusRow = { id: string; teacher_id: string; amount_sar: string; reason: string; period_month: string; created_at: Date;
  creator: string; payout_id: string | null; voided_at: Date | null; void_reason: string | null };

export function bonusesFor(teacherId: string) {
  return q<BonusRow>(
    `SELECT b.id, b.teacher_id, b.amount_sar, b.reason, to_char(b.period_month, 'YYYY-MM') AS period_month, b.created_at,
            u.full_name creator, b.payout_id, b.voided_at, b.void_reason
       FROM teacher_bonuses b JOIN users u ON u.id = b.created_by WHERE b.teacher_id = $1 ORDER BY b.period_month DESC, b.created_at DESC`,
    [teacherId]);
}

/** What each product pays the teacher per session (shown to approved teachers). */
export function productRates() {
  return q<{ code: string; name_ar: string; teacher_rate_sar: string }>(`SELECT code, name_ar, teacher_rate_sar FROM plans WHERE active ORDER BY price_sar DESC`);
}

export function payoutsFor(teacherId?: string) {
  return q<{ id: string; teacher_id: string; teacher_name: string; period_start: Date; period_end: Date;
    sessions_count: number; rate_sar: string; amount_sar: string; paid_at: Date; note: string | null; period_month: string }>(
    `SELECT po.*, to_char(po.period_start, 'YYYY-MM') AS period_month, u.full_name AS teacher_name FROM payouts po JOIN users u ON u.id = po.teacher_id
      ${teacherId ? "WHERE po.teacher_id = $1" : ""} ORDER BY po.period_start DESC`,
    teacherId ? [teacherId] : [],
  );
}
