import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { requirePerm } from "@/lib/auth";
import { q } from "@/lib/db";
import { SEVERITY, TICKET_CATEGORY, TICKET_LEVELS, TICKET_STATUS } from "@/lib/ticket-meta";
import { TICKET_SELECT, type TicketRow } from "@/lib/tickets";
import { dateTimeLabel } from "@/lib/time";

export const metadata = { title: "الدعم الفني" };

const VIEWS = { mine: "المسندة إليّ", open: "كل المفتوحة", overdue: "المتأخرة", done: "المغلقة" } as const;

export default async function TicketsPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const user = await requirePerm("tickets.handle");
  const view = ((await searchParams).view ?? "mine") as keyof typeof VIEWS;
  const where = view === "open" ? `t.status IN ('open','in_progress','waiting')`
    : view === "overdue" ? `t.status IN ('open','in_progress') AND t.due_at < now()`
    : view === "done" ? `t.status IN ('resolved','closed')`
    : `t.assigned_to = $1 AND t.status IN ('open','in_progress','waiting')`;
  const rows = await q<TicketRow>(`${TICKET_SELECT} WHERE ${where}
    ORDER BY CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.due_at LIMIT 200`, view === "mine" ? [user.id] : []);
  const counts = (await q<{ mine: string; open: string; overdue: string }>(`
    SELECT count(*) FILTER (WHERE assigned_to = $1 AND status IN ('open','in_progress','waiting')) mine,
           count(*) FILTER (WHERE status IN ('open','in_progress','waiting')) open,
           count(*) FILTER (WHERE status IN ('open','in_progress') AND due_at < now()) overdue FROM tickets`, [user.id]))[0];

  return (
    <>
      <PageTitle title="الدعم الفني" sub="العالية والحرجة تُسند فوراً لمسؤول التقنية أو المدير، وكل تذكرة تتجاوز مهلتها تُصعّد تلقائياً"
        action={<Link href="/admin/tickets/new" className="btn btn-primary">تذكرة جديدة</Link>} />
      <nav className="mb-6 flex flex-wrap gap-2" aria-label="عرض التذاكر">
        {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((v) => (
          <Link key={v} href={`/admin/tickets?view=${v}`} aria-current={view === v ? "page" : undefined}
            className={`rounded-full border-[1.5px] px-4 py-1.5 text-[.95rem] ${view === v ? "border-lav-600 bg-lav-700 text-white" : "border-line bg-white"}`}>
            {VIEWS[v]}{v !== "done" ? ` (${counts?.[v] ?? 0})` : ""}
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? <Empty title={view === "mine" ? "لا توجد تذاكر مسندة إليك" : "لا توجد تذاكر"} /> : (
        <div className="panel overflow-x-auto"><table className="table">
          <thead><tr><th>#</th><th>الموضوع</th><th>الدرجة</th><th>الحالة</th><th>المستوى / المسؤول</th><th>المهلة</th></tr></thead>
          <tbody>{rows.map((t) => {
            const late = ["open", "in_progress"].includes(t.status) && t.due_at.getTime() < Date.now();
            return (
              <tr key={t.id}>
                <td className="text-sm text-muted">{t.number}</td>
                <td><Link href={`/admin/tickets/${t.id}`} className="font-medium text-lav-700 underline">{t.subject}</Link>
                  <p className="text-xs text-muted">{TICKET_CATEGORY[t.category]}{t.requester_name ? ` · ${t.requester_name}` : ""}</p></td>
                <td><span className={`rounded-full px-2.5 py-0.5 text-sm ${SEVERITY[t.severity].tone}`}>{SEVERITY[t.severity].label}</span></td>
                <td className="text-sm">{TICKET_STATUS[t.status]}</td>
                <td className="text-sm">{TICKET_LEVELS[t.level]}<br /><span className="text-muted">{t.assignee_name ?? "غير مسندة"}</span></td>
                <td className={`text-sm ${late ? "font-medium text-bad" : "text-muted"}`}>{late ? "متأخرة · " : ""}{dateTimeLabel(t.due_at)}</td>
              </tr>
            );
          })}</tbody>
        </table></div>
      )}
    </>
  );
}
