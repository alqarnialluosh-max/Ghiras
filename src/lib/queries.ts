import type { SessionReport } from "./report";
import "server-only";
import { one, q } from "./db";
import type { Subject, Track } from "./domain";

export type BookingView = {
  id: string; subject: Subject; track: Track; starts_at: Date; ends_at: Date; status: string;
  description: string; teams_link: string; teams_source: string; teacher_notes: string | null; report: SessionReport | null;
  teacher_id: string; teacher_name: string; student_id: string; student_name: string; grade: number;
  parent_id: string; parent_name: string; subscription_id: string; reference: string; replaced_by: string | null;
};

const BASE = `
  SELECT b.id, b.subject, b.track, b.starts_at, b.ends_at, b.status, b.description, b.teams_link, b.teams_source, b.teacher_notes, b.report,
         b.teacher_id, t.full_name AS teacher_name, b.student_id, st.full_name AS student_name, st.grade,
         b.parent_id, p.full_name AS parent_name, b.subscription_id, s.reference, b.replaced_by
    FROM bookings b
    JOIN users t ON t.id = b.teacher_id
    JOIN users p ON p.id = b.parent_id
    JOIN students st ON st.id = b.student_id
    JOIN subscriptions s ON s.id = b.subscription_id`;

export function bookingsFor(role: "parent" | "teacher", userId: string, when: "upcoming" | "past" | "all", limit = 100) {
  const col = role === "parent" ? "b.parent_id" : "b.teacher_id";
  const time = when === "upcoming" ? "AND b.ends_at >= now() AND b.status = 'scheduled'"
    : when === "past" ? "AND (b.ends_at < now() OR b.status <> 'scheduled')" : "";
  const order = when === "upcoming" ? "ASC" : "DESC";
  return q<BookingView>(`${BASE} WHERE ${col} = $1 ${time} ORDER BY b.starts_at ${order} LIMIT $2`, [userId, limit]);
}

export function bookingById(id: string) {
  return one<BookingView>(`${BASE} WHERE b.id = $1`, [id]);
}

export function allBookings(filter: { from?: Date; to?: Date; status?: string }, limit = 300) {
  const params: unknown[] = [];
  const where: string[] = [];
  if (filter.from) { params.push(filter.from); where.push(`b.starts_at >= $${params.length}`); }
  if (filter.to) { params.push(filter.to); where.push(`b.starts_at < $${params.length}`); }
  if (filter.status) { params.push(filter.status); where.push(`b.status = $${params.length}::booking_status`); }
  params.push(limit);
  return q<BookingView>(`${BASE} ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY b.starts_at DESC LIMIT $${params.length}`, params);
}

export function studentsOf(parentId: string) {
  return q<{ id: string; full_name: string; grade: number; notes_enc: string | null }>(
    `SELECT id, full_name, grade, notes_enc FROM students WHERE parent_id = $1 AND archived_at IS NULL ORDER BY created_at`,
    [parentId],
  );
}
