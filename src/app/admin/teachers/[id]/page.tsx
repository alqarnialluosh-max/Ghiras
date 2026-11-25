import { env } from "@/lib/env";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageTitle } from "@/components/DashShell";
import { StatusChip } from "@/components/SessionCard";
import { decrypt } from "@/lib/crypto";
import { one, q } from "@/lib/db";
import { GRADES, SUBJECTS } from "@/lib/domain";
import { sar, teacherStats } from "@/lib/owner";
import { displayPhone } from "@/lib/phone";
import { monthlyEarnings, payoutsFor, teacherProfile } from "@/lib/teachers";
import { dateLabel, shortDate, timeLabel } from "@/lib/time";
import { recordPayoutAction, setTeacherStatusAction } from "../../actions";

export const metadata = { title: "ملف المعلمة" };

export default async function TeacherDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [p, stats, months, payouts, phone, sessions] = await Promise.all([
    teacherProfile(id), teacherStats(id), monthlyEarnings(id), payoutsFor(id),
    one<{ phone_enc: string | null }>(`SELECT phone_enc FROM users WHERE id = $1`, [id]),
    q<{ id: string; starts_at: Date; status: string; subject: keyof typeof SUBJECTS; student: string; grade: number }>(
      `SELECT b.id, b.starts_at, b.status, b.subject, st.full_name student, st.grade
         FROM bookings b JOIN students st ON st.id = b.student_id WHERE b.teacher_id = $1 ORDER BY b.starts_at DESC LIMIT 100`, [id]),
  ]);
  if (!p) notFound();
  const s = stats[0];
  const paidMonths = new Set(payouts.map((x) => x.period_month));
  const rate = env.teacherRateSar;

  return (
    <>
      <Link href="/admin/teachers/stats" className="mb-4 inline-block text-[.95rem] text-lav-700 underline">كل المعلمات</Link>
      <PageTitle title={p.full_name}
        sub={<>{p.cv_id ? <a href={`/api/documents/${p.cv_id}`} className="text-lav-700 underline">السيرة الذاتية</a> : <span className="text-bad">بدون سيرة ذاتية</span>} · {p.subjects.map((x) => SUBJECTS[x]).join("، ")} · {GRADES[p.min_grade]} — {GRADES[p.max_grade]} · <span dir="ltr">{p.email}</span>{phone?.phone_enc ? <> · <span dir="ltr">{displayPhone(decrypt(phone.phone_enc))}</span></> : null}</>}
        action={
          <form action={setTeacherStatusAction}>
            <input type="hidden" name="id" value={p.user_id} />
            <input type="hidden" name="op" value={p.status === "active" ? "suspend" : p.status === "pending" ? "approve" : "reactivate"} />
            <button className={`btn btn-sm ${p.status === "active" ? "btn-ghost" : "btn-primary"}`}>
              {p.status === "active" ? "إيقاف الحساب" : p.status === "pending" ? "تفعيل المعلمة" : "إعادة التفعيل"}
            </button>
          </form>
        } />

      {s && (
        <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="panel p-5"><p className="text-sm text-muted">حصص تمت</p><p className="font-display text-3xl">{s.completed}</p></div>
          <div className="panel p-5"><p className="text-sm text-muted">غياب طالب / معلمة</p><p className="font-display text-3xl">{s.student_absent} / <span className={s.teacher_absent ? "text-bad" : ""}>{s.teacher_absent}</span></p></div>
          <div className="panel p-5"><p className="text-sm text-muted">إجمالي المستحق</p><p className="font-display text-3xl">{sar(s.earned_total)}</p></div>
          <div className="panel p-5"><p className="text-sm text-muted">المدفوع</p><p className="font-display text-3xl text-ok">{sar(s.paid)}</p></div>
          <div className="panel p-5"><p className="text-sm text-muted">المتبقي لها</p><p className={`font-display text-3xl ${s.balance > 0 ? "text-bad" : ""}`}>{sar(s.balance)}</p></div>
        </div>
      )}

      <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
        <section>
          <h2 className="mb-3 text-xl">حسب الشهر</h2>
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>الشهر</th><th>الحصص</th><th>المستحق</th><th></th></tr></thead>
              <tbody>
                {months.length === 0 && <tr><td colSpan={4} className="text-muted">لا توجد حصص محتسبة.</td></tr>}
                {months.map((m) => (
                  <tr key={m.month}>
                    <td dir="ltr" className="text-right">{m.month}</td><td>{m.sessions}</td><td>{sar(Number(m.sessions) * rate)}</td>
                    <td>{paidMonths.has(m.month) ? <span className="chip chip-ok">مدفوع</span> : (
                      <form action={recordPayoutAction}><input type="hidden" name="teacher_id" value={id} /><input type="hidden" name="month" value={m.month} />
                        <button className="btn btn-ghost btn-sm">تسجيل الدفع</button></form>)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <section>
          <h2 className="mb-3 text-xl">آخر الحصص</h2>
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>الموعد</th><th>الطالب</th><th>المادة</th><th>الحالة</th></tr></thead>
              <tbody>
                {sessions.length === 0 && <tr><td colSpan={4} className="text-muted">لا توجد حصص.</td></tr>}
                {sessions.map((b) => (
                  <tr key={b.id}>
                    <td><Link href={`/admin/bookings/${b.id}`} className="text-lav-700 underline">{dateLabel(b.starts_at)}</Link><p className="text-xs text-muted">{timeLabel(b.starts_at)}</p></td>
                    <td>{b.student}<p className="text-xs text-muted">{GRADES[b.grade]}</p></td>
                    <td>{SUBJECTS[b.subject]}</td><td><StatusChip status={b.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payouts.length > 0 && <p className="mt-3 text-sm text-muted">آخر دفعة: {sar(Number(payouts[0].amount_sar))} بتاريخ {shortDate(payouts[0].paid_at)}</p>}
        </section>
      </div>
    </>
  );
}
