import { requirePerm } from "@/lib/auth";
import { env } from "@/lib/env";
import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { sar, teacherStats } from "@/lib/owner";
import { shortDate } from "@/lib/time";

export const metadata = { title: "حصص ومستحقات المعلمات" };

export default async function TeacherStatsPage() {
  await requirePerm("finance.view");
  const rows = await teacherStats();
  const totals = rows.reduce((a, r) => ({
    payable: a.payable + r.payable_total, month: a.month + r.payable_month,
    earned: a.earned + r.earned_total, paid: a.paid + r.paid, balance: a.balance + r.balance,
  }), { payable: 0, month: 0, earned: 0, paid: 0, balance: 0 });
  const rate = env.teacherRateSar;

  return (
    <>
      <PageTitle title="حصص ومستحقات المعلمات"
        sub="المحتسب: الحصص المكتملة والحصص التي تغيّب فيها الطالب. ولا يُحتسب غياب المعلمة."
        action={<Link href="/admin/payouts" className="btn btn-ghost">صرف الأجور</Link>} />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5"><p className="text-sm text-muted">حصص محتسبة هذا الشهر</p><p className="font-display text-3xl">{totals.month}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">إجمالي المستحق منذ البداية</p><p className="font-display text-3xl">{sar(totals.earned)}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">المدفوع</p><p className="font-display text-3xl text-ok">{sar(totals.paid)}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">المتبقي لهم</p><p className={`font-display text-3xl ${totals.balance > 0 ? "text-bad" : "text-ok"}`}>{sar(totals.balance)}</p></div>
      </div>

      {rows.length === 0 ? <Empty title="لا توجد معلمات بعد" /> : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>المعلمة</th><th>تمت</th><th>غياب طالب</th><th>غياب معلمة</th><th>قادمة</th>
                <th>محتسب الشهر</th><th>مستحق الشهر</th><th>إجمالي المستحق</th><th>المدفوع</th><th>المتبقي</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/admin/teachers/${r.id}`} className="font-medium text-lav-700 underline">{r.full_name}</Link>
                    <p className="text-xs text-muted">
                      {r.status === "active" ? "معتمدة" : r.status === "pending" ? "بانتظار التفعيل" : "موقوفة"}
                      {!r.has_teams && " · بدون Teams"}{r.last_session ? ` · آخر حصة ${shortDate(r.last_session)}` : ""}
                    </p>
                  </td>
                  <td>{r.completed}</td><td>{r.student_absent}</td>
                  <td className={r.teacher_absent > 0 ? "text-bad" : ""}>{r.teacher_absent}</td>
                  <td>{r.upcoming}</td><td>{r.payable_month}</td><td>{sar(r.earned_month)}</td>
                  <td>{sar(r.earned_total)}</td><td className="text-ok">{sar(r.paid)}</td>
                  <td className={`font-semibold ${r.balance > 0 ? "text-bad" : ""}`}>{sar(r.balance)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="p-3">الإجمالي</td><td colSpan={4} /><td className="p-3">{totals.month}</td><td className="p-3">{sar(totals.month * rate)}</td>
                <td className="p-3">{sar(totals.earned)}</td><td className="p-3">{sar(totals.paid)}</td><td className="p-3">{sar(totals.balance)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </>
  );
}
