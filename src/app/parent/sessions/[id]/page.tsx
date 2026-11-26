import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { RequestPanel } from "@/components/RequestPanel";
import { ProposalForm } from "@/components/RequestForms";
import { SessionDetail } from "@/components/SessionDetail";
import { requireRole } from "@/lib/auth";
import { bookingById, latestInChain } from "@/lib/queries";

export const metadata = { title: "تفاصيل الحصة" };

export default async function ParentSession({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ booked?: string; requested?: string; confirmed?: string }>;
}) {
  const user = await requireRole("parent");
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const b = await bookingById(id);
  if (!b || b.parent_id !== user.id) notFound(); // never reveal other families' sessions
  // A request that moved on (other teacher / proposed time): show where it stands now.
  if (b.replaced_by) redirect(`/parent/sessions/${await latestInChain(b.id)}`);
  return (
    <>
      <Link href="/parent/sessions" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل الحصص</Link>
      {sp.requested && b.status === "requested" && (
        <p role="status" className="alert alert-ok mb-6">أرسلنا طلبك إلى {b.teacher_name}. ستصلك رسالة فور التأكيد.</p>
      )}
      {sp.confirmed && b.status === "scheduled" && (
        <p role="status" className="alert alert-ok mb-6">تم تأكيد الموعد، ورابط Teams جاهز في هذه الصفحة.</p>
      )}
      <RequestPanel b={b} viewer="parent">
        {b.status === "proposed" && b.proposal_stage === "parent" ? <ProposalForm id={b.id} /> : null}
      </RequestPanel>
      <SessionDetail b={b} viewer="parent" />
    </>
  );
}
