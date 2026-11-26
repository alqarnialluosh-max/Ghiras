import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { can } from "@/lib/permissions";
import { SEVERITY, TICKET_LEVELS } from "@/lib/ticket-meta";
import { TICKET_SELECT, type TicketRow } from "@/lib/tickets";
import { dateTimeLabel } from "@/lib/time";

/** "My work" for anyone in the administration: tickets, approvals, requests that need attention. */
export async function WorkPanel({ user }: { user: SessionUser }) {
  const tickets = can(user, "tickets.handle");
  const decide = can(user, "approvals.decide");
  const requests = can(user, "requests.manage");
  const lead = user.role === "admin" || user.staff_role === "manager";
  const [mine, counts] = await Promise.all([
    tickets ? q<TicketRow>(`${TICKET_SELECT} WHERE t.assigned_to = $1 AND t.status IN ('open','in_progress','waiting')
                            ORDER BY CASE t.severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 ELSE 2 END, t.due_at LIMIT 5`, [user.id]) : Promise.resolve([]),
    q<{ overdue: string; approvals: string; my_requests: string; open_req: string; declines: string }>(`
      SELECT (SELECT count(*) FROM tickets WHERE status IN ('open','in_progress') AND due_at < now()) overdue,
             (SELECT count(*) FROM approvals WHERE status = 'pending' AND requested_by <> $1) approvals,
             (SELECT count(*) FROM approvals WHERE status = 'pending' AND requested_by = $1) my_requests,
             (SELECT count(*) FROM bookings WHERE status IN ('requested','proposed')) open_req,
             (SELECT count(*) FROM bookings WHERE decline_kind IN ('teacher','timeout') AND decline_reviewed_at IS NULL) declines`, [user.id]),
  ]);
  const c = counts[0];
  const tiles = [
    tickets && { href: "/admin/tickets", label: "تذاكر مسندة إليك", n: mine.length, warn: mine.some((t) => t.severity === "critical") },
    tickets && lead && { href: "/admin/tickets?view=overdue", label: "تذاكر متأخرة", n: Number(c.overdue), warn: Number(c.overdue) > 0 },
    decide && { href: "/admin/approvals", label: "اعتمادات بانتظارك", n: Number(c.approvals), warn: Number(c.approvals) > 0 },
    !decide && { href: "/admin/approvals", label: "طلباتك بانتظار الاعتماد", n: Number(c.my_requests) },
    requests && { href: "/admin/requests", label: "طلبات حجز معلقة", n: Number(c.open_req) },
    requests && { href: "/admin/requests", label: "اعتذارات للمراجعة", n: Number(c.declines), warn: Number(c.declines) > 0 },
  ].filter(Boolean) as { href: string; label: string; n: number; warn?: boolean }[];
  if (!tiles.length) return null;

  return (
    <section aria-labelledby="work" className="mb-10">
      <h2 id="work" className="mb-3 text-xl">عملي</h2>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} className={`panel p-5 hover:border-lav-400 ${t.warn ? "border-amber-200 bg-amber-50" : ""}`}>
            <p className="text-sm text-muted">{t.label}</p>
            <p className="mt-1 font-display text-3xl">{t.n}</p>
          </Link>
        ))}
      </div>
      {mine.length > 0 && (
        <ul className="mt-4 space-y-2">
          {mine.map((t) => (
            <li key={t.id}>
              <Link href={`/admin/tickets/${t.id}`} className="panel flex flex-wrap items-center justify-between gap-2 p-4 hover:border-lav-400">
                <span><span className={`ml-2 rounded-full px-2.5 py-0.5 text-sm ${SEVERITY[t.severity].tone}`}>{SEVERITY[t.severity].label}</span>
                  #{t.number} · {t.subject}</span>
                <span className="text-sm text-muted">{TICKET_LEVELS[t.level]} · المهلة {dateTimeLabel(t.due_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
