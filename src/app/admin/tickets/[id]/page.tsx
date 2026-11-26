import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/DashShell";
import { requirePerm } from "@/lib/auth";
import { q } from "@/lib/db";
import { roleLabel } from "@/lib/permissions";
import { SEVERITY, TICKET_CATEGORY, TICKET_LEVELS, TICKET_STATUS } from "@/lib/ticket-meta";
import { pathFor, ticketById } from "@/lib/tickets";
import { dateTimeLabel } from "@/lib/time";
import { teamForAssignment } from "../../team-actions";
import { ApprovalRequestForm, EscalateForm, TicketUpdateForm } from "../TicketForms";

export const metadata = { title: "تذكرة دعم" };

const KIND: Record<string, string> = {
  created: "فتح التذكرة", comment: "تحديث", status: "تغيير الحالة", assign: "إسناد", escalate: "تصعيد", auto_escalate: "تصعيد تلقائي", approval: "اعتماد",
};

export default async function TicketPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; done?: string }> }) {
  const user = await requirePerm("tickets.handle");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const t = await ticketById(id);
  if (!t) notFound();
  const { created, done } = await searchParams;
  const [events, team, refs] = await Promise.all([
    q<{ id: string; kind: string; body: string | null; data: Record<string, unknown>; created_at: Date; actor: string | null }>(
      `SELECT e.id, e.kind, e.body, e.data, e.created_at, u.full_name actor FROM ticket_events e LEFT JOIN users u ON u.id = e.actor_id
        WHERE e.ticket_id = $1 ORDER BY e.created_at`, [t.id]),
    teamForAssignment(),
    t.requester_id && t.requester_role === "parent"
      ? q<{ reference: string }>(`SELECT reference FROM subscriptions WHERE parent_id = $1 AND status IN ('active','pending_payment') ORDER BY created_at DESC`, [t.requester_id])
      : Promise.resolve([]),
  ]);
  const open = ["open", "in_progress", "waiting"].includes(t.status);
  const next = pathFor(t.category).find((l) => l > t.level);
  const late = ["open", "in_progress"].includes(t.status) && t.due_at.getTime() < Date.now();

  return (
    <>
      <Link href="/admin/tickets" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل التذاكر</Link>
      {done === "saved" && <p role="status" className="alert alert-ok mb-6">تم الحفظ.</p>}
      {done === "escalated" && <p role="status" className="alert alert-ok mb-6">صُعّدت التذكرة إلى {TICKET_LEVELS[t.level]}{t.assignee_name ? ` (${t.assignee_name})` : ""} وأُبلغ المسؤول.</p>}
      {created && <p role="status" className="alert alert-ok mb-6">فُتحت التذكرة #{t.number}{t.level > 0 ? ` وأُسندت إلى ${t.assignee_name ?? TICKET_LEVELS[t.level]}` : ""}.</p>}
      <PageTitle title={`#${t.number} · ${t.subject}`} sub={`${TICKET_CATEGORY[t.category]} · فتحها ${t.opener_name} · ${dateTimeLabel(t.created_at)}`} />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="space-y-6">
          <section className="panel p-6">
            <h2 className="mb-4 text-lg">السجل</h2>
            <ol className="space-y-4">
              {events.map((e) => (
                <li key={e.id} className="border-r-2 border-lav-200 pr-4">
                  <p className="text-sm text-muted">{KIND[e.kind] ?? e.kind} · {e.actor ?? "النظام"} · {dateTimeLabel(e.created_at)}</p>
                  {e.kind === "status" && <p>{TICKET_STATUS[e.data.from as keyof typeof TICKET_STATUS]} ← {TICKET_STATUS[e.data.to as keyof typeof TICKET_STATUS]}</p>}
                  {(e.kind === "escalate" || e.kind === "auto_escalate") && <p>إلى {TICKET_LEVELS[Number(e.data.to)]}</p>}
                  {e.body && <p className="mt-1 whitespace-pre-line">{e.body}</p>}
                </li>
              ))}
            </ol>
          </section>
          {open && (
            <section className="panel p-6">
              <h2 className="mb-4 text-lg">تحديث التذكرة</h2>
              <TicketUpdateForm id={t.id} status={t.status} mine={t.assigned_to === user.id}
                canAssignOthers={user.role === "admin" || user.staff_role === "manager"}
                team={team.map((m) => ({ id: m.id, label: `${m.full_name} · ${roleLabel(m)}` }))} />
            </section>
          )}
          <section className="panel p-6">
            <h2 className="mb-1 text-lg">طلب اعتماد مرتبط</h2>
            <p className="mb-4 text-sm text-muted">حصة تعويضية أو تمديد اشتراك أو تفعيل يدوي، يعتمده المدير أو المالك.</p>
            <ApprovalRequestForm ticketId={t.id} references={refs.map((r) => r.reference)} />
          </section>
        </div>

        <aside className="space-y-4">
          <div className="panel space-y-3 p-5 text-[.95rem]">
            <p><span className="text-muted">الدرجة: </span><span className={`rounded-full px-2.5 py-0.5 text-sm ${SEVERITY[t.severity].tone}`}>{SEVERITY[t.severity].label}</span></p>
            <p><span className="text-muted">الحالة: </span>{TICKET_STATUS[t.status]}</p>
            <p><span className="text-muted">المستوى: </span>{TICKET_LEVELS[t.level]}</p>
            <p><span className="text-muted">المسؤول: </span>{t.assignee_name ?? "غير مسندة"}</p>
            <p className={late ? "font-medium text-bad" : ""}><span className="text-muted">المهلة: </span>{dateTimeLabel(t.due_at)}{late ? " (متأخرة)" : ""}</p>
            {t.requester_name && <p><span className="text-muted">صاحب المشكلة: </span>{t.requester_name}<br /><span className="text-sm text-muted" dir="ltr">{t.requester_email}</span></p>}
          </div>
          {open && next !== undefined && (
            <div className="panel p-5"><EscalateForm id={t.id} next={TICKET_LEVELS[next]} /></div>
          )}
        </aside>
      </div>
    </>
  );
}
