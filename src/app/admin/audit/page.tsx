import { requirePerm } from "@/lib/auth";
import { PageTitle } from "@/components/DashShell";
import { q } from "@/lib/db";
import { dateTimeLabel } from "@/lib/time";

export const metadata = { title: "السجل" };

export default async function AdminAudit() {
  await requirePerm("audit.view");
  const rows = await q<{ id: string; action: string; entity: string; entity_id: string | null; data: Record<string, unknown>;
    created_at: Date; actor: string | null }>(
    `SELECT a.id, a.action, a.entity, a.entity_id, a.data, a.created_at, u.full_name actor
       FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT 300`);
  return (
    <>
      <PageTitle title="سجل العمليات" sub="كل عملية مهمة تُسجل هنا ولا يمكن تعديلها أو حذفها." />
      <div className="panel overflow-x-auto">
        <table className="table">
          <thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>تفاصيل</th></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id}>
              <td className="whitespace-nowrap text-sm">{dateTimeLabel(r.created_at)}</td>
              <td>{r.actor ?? "النظام"}</td>
              <td dir="ltr" className="text-right font-medium">{r.action}</td>
              <td dir="ltr" className="text-right text-sm text-muted">{r.entity}{r.entity_id ? `:${r.entity_id.slice(0, 8)}` : ""}</td>
              <td dir="ltr" className="max-w-xs truncate text-right text-xs text-muted">{Object.keys(r.data).length ? JSON.stringify(r.data) : ""}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
