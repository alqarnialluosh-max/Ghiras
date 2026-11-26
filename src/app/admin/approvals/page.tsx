import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { requirePerm } from "@/lib/auth";
import { listApprovals, type ApprovalRow } from "@/lib/approvals";
import { can } from "@/lib/permissions";
import { APPROVAL_KIND } from "@/lib/ticket-meta";
import { dateTimeLabel } from "@/lib/time";
import { ApprovalRequestForm } from "../tickets/TicketForms";
import { DecideForm } from "./DecideForm";

export const metadata = { title: "الاعتمادات" };

const detail = (a: ApprovalRow) => a.kind === "extra_session" ? `${a.payload.sessions} حصة` : a.kind === "extend_subscription" ? `${a.payload.days} أيام` : "";

function Card({ a, decide }: { a: ApprovalRow; decide: boolean }) {
  return (
    <article className="panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">#{a.number} · {APPROVAL_KIND[a.kind]} {detail(a) && <span className="text-muted">({detail(a)})</span>}</p>
        <span className={`chip ${a.status === "approved" ? "chip-ok" : a.status === "rejected" ? "chip-bad" : "chip-warn"}`}>
          {a.status === "approved" ? "معتمد ومنفّذ" : a.status === "rejected" ? "مرفوض" : "بانتظار الاعتماد"}
        </span>
      </div>
      <p className="mt-1 text-[.95rem] text-muted">{a.student} · {a.parent} · <span dir="ltr">{a.reference}</span>
        {a.ticket_number && a.ticket_id && <> · <Link href={`/admin/tickets/${a.ticket_id}`} className="text-lav-700 underline">تذكرة #{a.ticket_number}</Link></>}</p>
      <p className="mt-2">السبب: {a.reason}</p>
      <p className="mt-1 text-sm text-muted">طلبه {a.requester} · {dateTimeLabel(a.created_at)}
        {a.decider && <> · {a.status === "approved" ? "اعتمده" : "رفضه"} {a.decider}{a.decided_at ? ` · ${dateTimeLabel(a.decided_at)}` : ""}</>}</p>
      {a.decision_note && <p className="mt-1 text-sm">ملاحظة القرار: {a.decision_note}</p>}
      {decide && <DecideForm id={a.id} />}
    </article>
  );
}

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requirePerm();
  const { done } = await searchParams;
  const decider = can(user, "approvals.decide");
  const rows = await listApprovals(decider ? "TRUE" : "a.requested_by = $1", decider ? [] : [user.id]);
  const pending = rows.filter((a) => a.status === "pending");
  const history = rows.filter((a) => a.status !== "pending");
  return (
    <>
      {done && <p role="status" className="alert alert-ok mb-6">{done === "approved" ? "اعتُمد الطلب ونُفّذ، وأُبلغ مقدّمه." : "رُفض الطلب وأُبلغ مقدّمه."}</p>}
      <PageTitle title="الاعتمادات" sub="الإجراءات الحساسة يطلبها الفريق ويعتمدها المدير أو المالك، ولا يعتمد أحد طلبه بنفسه" />
      <section className="mb-10">
        <h2 className="mb-3 text-xl">بانتظار الاعتماد ({pending.length})</h2>
        {pending.length === 0 ? <Empty title="لا توجد طلبات معلقة" /> : (
          <div className="space-y-3">{pending.map((a) => <Card key={a.id} a={a} decide={decider && a.requested_by !== user.id} />)}</div>
        )}
      </section>
      <section className="panel mb-10 p-6">
        <h2 className="mb-4 text-xl">طلب اعتماد جديد</h2>
        <ApprovalRequestForm />
      </section>
      <section>
        <h2 className="mb-3 text-xl">السجل</h2>
        {history.length === 0 ? <Empty title="لا يوجد سجل بعد" /> : <div className="space-y-3">{history.map((a) => <Card key={a.id} a={a} decide={false} />)}</div>}
      </section>
    </>
  );
}
