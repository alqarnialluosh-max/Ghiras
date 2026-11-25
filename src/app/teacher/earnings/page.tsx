import { Empty, PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { env } from "@/lib/env";
import { monthlyEarnings, payoutsFor } from "@/lib/teachers";
import { shortDate } from "@/lib/time";
import { teacherProfile } from "@/lib/teachers";
import { TeacherPayTerms } from "@/components/TeacherPayTerms";

export const metadata = { title: "مستحقاتي" };

export default async function EarningsPage() {
  const user = await requireRole("teacher");
  const rate = env.teacherRateSar;
  const profile = await teacherProfile(user.id);
  if (!profile?.approved_at || user.status !== "active") {
    return (
      <>
        <PageTitle title="مستحقاتي" />
        <div className="panel max-w-2xl p-6">
          <p className="font-medium">يتحدد أجر الحصة بعد المقابلة والقبول</p>
          <p className="mt-1 text-muted">بعد اعتماد حسابك تظهر لك هنا شروط الأجر ومستحقاتك الشهرية.</p>
        </div>
      </>
    );
  }
  const [months, payouts] = await Promise.all([monthlyEarnings(user.id), payoutsFor(user.id)]);
  return (
    <>
      <PageTitle title="مستحقاتي" sub="تُحتسب الحصص المكتملة والحصص التي تغيّب فيها الطالب." />
      <div className="mb-10 max-w-3xl"><TeacherPayTerms rate={rate} /></div>
      <section className="mb-10">
        <h2 className="mb-3 text-xl">حسب الشهر</h2>
        {months.length === 0 ? <Empty title="لا توجد حصص محتسبة بعد" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>الشهر</th><th>الحصص</th><th>المستحق</th></tr></thead>
              <tbody>{months.map((m) => (
                <tr key={m.month}><td dir="ltr" className="text-right">{m.month}</td><td>{m.sessions}</td><td>{Number(m.sessions) * rate} ريال</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl">الدفعات المستلمة</h2>
        {payouts.length === 0 ? <Empty title="لا توجد دفعات مسجلة بعد" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>الفترة</th><th>الحصص</th><th>المبلغ</th><th>تاريخ الدفع</th></tr></thead>
              <tbody>{payouts.map((p) => (
                <tr key={p.id}><td>{shortDate(p.period_start)} – {shortDate(p.period_end)}</td><td>{p.sessions_count}</td>
                  <td>{Number(p.amount_sar)} ريال</td><td>{shortDate(p.paid_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
