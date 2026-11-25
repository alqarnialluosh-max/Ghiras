import "server-only";
import { one, q } from "./db";
import type { Subject } from "./domain";

export type TeacherProfile = {
  user_id: string; full_name: string; email: string; status: string; bio: string; qualification: string;
  years_experience: number; subjects: Subject[]; min_grade: number; max_grade: number; teams_link: string | null;
  accepting: boolean; approved_at: Date | null; created_at: Date;
};

const PROFILE = `
  SELECT p.user_id, u.full_name, u.email, u.status, p.bio, p.qualification, p.years_experience,
         p.subjects::text[] AS subjects, p.min_grade, p.max_grade, p.teams_link, p.accepting, p.approved_at, u.created_at
    FROM teacher_profiles p JOIN users u ON u.id = p.user_id`;

export function teacherProfile(id: string) {
  return one<TeacherProfile>(`${PROFILE} WHERE p.user_id = $1`, [id]);
}

export function allTeachers() {
  return q<TeacherProfile>(`${PROFILE} WHERE u.archived_at IS NULL ORDER BY (u.status = 'pending') DESC, u.created_at DESC`);
}

/** Sessions that earn pay: the teacher showed up (completed, or the student was absent). */
export const PAYABLE = ["completed", "student_absent"];

export function monthlyEarnings(teacherId?: string) {
  return q<{ teacher_id: string; teacher_name: string; month: string; sessions: string }>(
    `SELECT b.teacher_id, u.full_name AS teacher_name,
            to_char(date_trunc('month', b.starts_at AT TIME ZONE 'Asia/Riyadh'), 'YYYY-MM') AS month,
            count(*) AS sessions
       FROM bookings b JOIN users u ON u.id = b.teacher_id
      WHERE b.status = ANY($1::booking_status[]) ${teacherId ? "AND b.teacher_id = $2" : ""}
      GROUP BY 1, 2, 3 ORDER BY 3 DESC, 2`,
    teacherId ? [PAYABLE, teacherId] : [PAYABLE],
  );
}

export function payoutsFor(teacherId?: string) {
  return q<{ id: string; teacher_id: string; teacher_name: string; period_start: Date; period_end: Date;
    sessions_count: number; rate_sar: string; amount_sar: string; paid_at: Date; note: string | null }>(
    `SELECT po.*, u.full_name AS teacher_name FROM payouts po JOIN users u ON u.id = po.teacher_id
      ${teacherId ? "WHERE po.teacher_id = $1" : ""} ORDER BY po.period_start DESC`,
    teacherId ? [teacherId] : [],
  );
}
