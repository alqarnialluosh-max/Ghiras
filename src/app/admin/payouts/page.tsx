import { Empty, PageTitle } from "@/components/DashShell";
import { env } from "@/lib/env";
import { monthlyEarnings, payoutsFor } from "@/lib/teachers";
import { shortDate } from "@/lib/time";
import { recordPayoutAction } from "../actions";

export const metadata = { title: "أجور المعلمات" };

export default async function AdminPayouts() {
  const rate = env.teacherRateSar;
  const [months, payouts] = await Promise.all([monthlyEarnings(), payoutsFor()]);
  const paidKey = new Set(payouts.map((p) => `${p.teacher_id}:${new Date(p.period_start).toISOString().slice(0, 7)}`));
  return (
    <>
      <PageTitle title="أجور المعلمات" sub={`${rate} ريال عن كل حصة مكتملة أو غاب فيها الطالب. سجّل الدفعة بعد التحويل للمعلمة.`} />
      <section className="mb-10">
        <h2 className="mb-3 text-xl">المستحقات الشهرية</h2>
        {months.length === 0 ? <Empty title="ما فيه حصص محتسبة بعد" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>المعلمة</th><th>الشهر</th><th>الحصص</th><th>المستحق</th><th></th></tr></thead>
              <tbody>{months.map((m) => {
                const paid = paidKey.has(`${m.teacher_id}:${m.month}`);
                return (
                  <tr key={`${m.teacher_id}${m.month}`}>
                    <td>{m.teacher_name}</td><td dir="ltr" className="text-right">{m.month}</td><td>{m.sessions}</td>
                    <td>{Number(m.sessions) * rate} ريال</td>
                    <td>{paid ? <span className="chip chip-ok">مدفوع</span> : (
                      <form action={recordPayoutAction}>
                        <input type="hidden" name="teacher_id" value={m.teacher_id} /><input type="hidden" name="month" value={m.month} />
                        <button className="btn btn-ghost btn-sm">تسجيل الدفع</button>
                      </form>)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
      <section>
        <h2 className="mb-3 text-xl">الدفعات المسجلة</h2>
        {payouts.length === 0 ? <Empty title="ما فيه دفعات مسجلة" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>المعلمة</th><th>الفترة</th><th>الحصص</th><th>المبلغ</th><th>تاريخ التسجيل</th></tr></thead>
              <tbody>{payouts.map((p) => (
                <tr key={p.id}><td>{p.teacher_name}</td><td>{shortDate(p.period_start)} – {shortDate(p.period_end)}</td>
                  <td>{p.sessions_count}</td><td>{Number(p.amount_sar)} ريال</td><td>{shortDate(p.paid_at)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
