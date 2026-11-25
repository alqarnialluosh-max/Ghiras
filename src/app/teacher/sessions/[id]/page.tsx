import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/SessionDetail";
import { requireRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { one } from "@/lib/db";
import { bookingById } from "@/lib/queries";
import { SessionReportForm } from "./SessionReportForm";

export const metadata = { title: "تفاصيل الحصة" };

export default async function TeacherSession({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole("teacher");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const b = await bookingById(id);
  if (!b || b.teacher_id !== user.id) notFound();
  const st = await one<{ notes_enc: string | null }>(`SELECT notes_enc FROM students WHERE id = $1`, [b.student_id]);
  const started = b.starts_at.getTime() <= Date.now();
  const editable = ["scheduled", "completed", "student_absent"].includes(b.status);
  return (
    <>
      <Link href="/teacher/sessions" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل الحصص</Link>
      <SessionDetail b={b} viewer="teacher" studentNotes={decrypt(st?.notes_enc)}>
        {editable && (
          <section className="mt-8 border-t border-line pt-6">
            <h2 className="text-lg font-semibold">الحضور والتقرير</h2>
            {started ? (
              <SessionReportForm id={b.id} status={b.status} notes={b.teacher_notes ?? ""} />
            ) : (
              <p className="mt-2 text-muted">يفتح نموذج الحضور والتقرير بعد بداية الحصة.</p>
            )}
          </section>
        )}
      </SessionDetail>
    </>
  );
}
