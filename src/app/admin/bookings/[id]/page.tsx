import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/forms";
import { SessionDetail } from "@/components/SessionDetail";
import { decrypt } from "@/lib/crypto";
import { one } from "@/lib/db";
import { BOOKING_STATUS } from "@/lib/domain";
import { bookingById } from "@/lib/queries";
import { allTeachers } from "@/lib/teachers";
import { riyadhDateKey } from "@/lib/time";
import { rescheduleAction, setBookingStatusAction } from "../../actions";
import { FamilyGoals } from "@/components/FamilyGoals";

export const metadata = { title: "حصة" };

export default async function AdminBooking({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ rescheduled?: string }>;
}) {
  await requirePerm("sessions.view");
  const { id } = await params;
  const { rescheduled } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const b = await bookingById(id);
  if (!b) notFound();
  const [st, teachers, origin] = await Promise.all([
    one<{ notes_enc: string | null }>(`SELECT notes_enc FROM students WHERE id = $1`, [b.student_id]),
    allTeachers(),
    one<{ id: string }>(`SELECT id FROM bookings WHERE replaced_by = $1`, [b.id]),
  ]);
  const eligible = teachers.filter((t) => t.status === "active" && t.approved_at && t.teams_link && t.subjects.includes(b.subject));

  return (
    <>
      <Link href="/admin/bookings" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل الحصص</Link>
      {rescheduled && <p className="alert alert-ok mb-4">تمت إعادة الجدولة. الحصة الأصلية محفوظة في السجل.</p>}
      {origin && <p className="alert alert-info mb-4">هذه الحصة بديلة عن <Link href={`/admin/bookings/${origin.id}`} className="underline">حصة أعيدت جدولتها</Link>.</p>}
      {b.replaced_by && <p className="alert alert-info mb-4">أعيدت جدولة هذه الحصة إلى <Link href={`/admin/bookings/${b.replaced_by}`} className="underline">الموعد الجديد</Link>.</p>}
      <SessionDetail b={b} viewer="admin" studentNotes={decrypt(st?.notes_enc)}>
        <FamilyGoals parentId={b.parent_id} />
        {["scheduled", "completed", "student_absent", "teacher_absent"].includes(b.status) && (
          <div className="mt-8 grid gap-6 border-t border-line pt-6 md:grid-cols-2">
            <section>
              <h2 className="mb-3 text-lg font-semibold">تعديل الحالة</h2>
              <ActionForm action={setBookingStatusAction}>
                <input type="hidden" name="id" value={b.id} />
                <select name="status" defaultValue={b.status} className="input">
                  {["scheduled", "completed", "student_absent", "teacher_absent"].map((s) => <option key={s} value={s}>{BOOKING_STATUS[s]}</option>)}
                </select>
                <p className="text-xs text-muted">«غياب المعلمة» يرجع الحصة لرصيد الطالب ولا تُحتسب أجراً.</p>
                <SubmitButton className="btn btn-ghost btn-sm">حفظ الحالة</SubmitButton>
              </ActionForm>
            </section>
            <section>
              <h2 className="mb-3 text-lg font-semibold">إعادة الجدولة</h2>
              <ActionForm action={rescheduleAction}>
                <input type="hidden" name="id" value={b.id} />
                <select name="teacher_id" defaultValue={b.teacher_id} className="input">
                  {eligible.map((t) => <option key={t.user_id} value={t.user_id}>{t.full_name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" name="date" min={riyadhDateKey(new Date())} className="input" required />
                  <input type="time" name="time" step={1800} className="input" required />
                </div>
                <input name="note" className="input" placeholder="سبب إعادة الجدولة" />
                <SubmitButton className="btn btn-primary btn-sm">أعد الجدولة</SubmitButton>
              </ActionForm>
            </section>
          </div>
        )}
      </SessionDetail>
    </>
  );
}
