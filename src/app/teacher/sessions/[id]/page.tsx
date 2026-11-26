import Link from "next/link";
import { notFound } from "next/navigation";
import { SessionDetail } from "@/components/SessionDetail";
import { requireRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { one } from "@/lib/db";
import { bookingById } from "@/lib/queries";
import { SessionReportForm } from "./SessionReportForm";
import { FamilyGoals } from "@/components/FamilyGoals";
import { RequestPanel } from "@/components/RequestPanel";
import { TeacherRequestForm } from "@/components/RequestForms";

export const metadata = { title: "تفاصيل الحصة" };

const DONE: Record<string, string> = {
  accepted: "تم قبول الحصة، وأُرسل التأكيد ورابط Teams لولي الأمر.",
  proposed: "شكراً، أرسلنا الموعد لولي الأمر ليؤكده، ويصلكِ التأكيد بعد موافقته.",
  declined: "وصل اعتذاركِ للإدارة، وتحوّل الطلب تلقائياً.",
};

export default async function TeacherSession({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ done?: string }>;
}) {
  const user = await requireRole("teacher");
  const { id } = await params;
  const { done } = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const b = await bookingById(id);
  if (!b || b.teacher_id !== user.id) notFound();
  const st = await one<{ notes_enc: string | null }>(`SELECT notes_enc FROM students WHERE id = $1`, [b.student_id]);
  const started = b.starts_at.getTime() <= Date.now();
  const editable = ["scheduled", "completed", "student_absent"].includes(b.status);
  return (
    <>
      <Link href="/teacher/sessions" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل الحصص</Link>
      {done && DONE[done] && <p role="status" className="alert alert-ok mb-6">{DONE[done]}</p>}
      <RequestPanel b={b} viewer="teacher">
        {(b.status === "requested" || (b.status === "proposed" && b.proposal_stage === "teacher")) && <TeacherRequestForm id={b.id} />}
      </RequestPanel>
      <SessionDetail b={b} viewer="teacher" studentNotes={decrypt(st?.notes_enc)}>
        <FamilyGoals parentId={b.parent_id} />
        {editable && (
          <section className="mt-8 border-t border-line pt-6">
            <h2 className="text-lg font-semibold">الحضور وتقرير الحصة</h2>
            {started ? (
              <SessionReportForm id={b.id} status={b.status} notes={b.teacher_notes ?? ""} report={b.report ?? {}} />
            ) : (
              <p className="mt-2 text-muted">يُتاح نموذج الحضور والتقرير بعد بداية الحصة.</p>
            )}
          </section>
        )}
      </SessionDetail>
    </>
  );
}
