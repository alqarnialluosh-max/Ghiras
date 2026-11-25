import Link from "next/link";
import { PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { SUBJECTS } from "@/lib/domain";
import { monthlyFinance, ownerOverview, sar, subscribersByPlan } from "@/lib/owner";
import { allBookings } from "@/lib/queries";
import { expireOverdue } from "@/lib/subscriptions";
import { allTeachers } from "@/lib/teachers";
import { addDaysKey, riyadhDateKey, riyadhToUtc } from "@/lib/time";
import { setTeacherStatusAction } from "./actions";

export const metadata = { title: "لوحة المالك" };

function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: "lav" | "sky" | "ok" | "bad" }) {
  const color = tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "sky" ? "text-sky-700" : "text-ink";
  return (
    <div className="panel p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-3xl ${color}`}>{value}</p>
      {sub && <p className="mt-1 text-[.85rem] text-muted">{sub}</p>}
    </div>
  );
}

const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthName = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

export default async function OwnerHome() {
  await expireOverdue();
  const today = riyadhDateKey(new Date());
  const [o, plans, finance, teachers, todays] = await Promise.all([
    ownerOverview(), subscribersByPlan(), monthlyFinance(6), allTeachers(),
    allBookings({ from: riyadhToUtc(today, 0), to: riyadhToUtc(addDaysKey(today, 1), 0) }),
  ]);
  const pendingTeachers = teachers.filter((t) => t.status === "pending");
  const maxRev = Math.max(1, ...finance.map((f) => Math.max(f.revenue, f.cost)));
  const growth = o.revenueLastMonth > 0 ? Math.round(((o.revenueMonth - o.revenueLastMonth) / o.revenueLastMonth) * 100) : null;

  return (
    <>
      <PageTitle title="لوحة المالك" sub="كل أرقام غِراس في مكان واحد. الشهر = الشهر الحالي بتوقيت الرياض."
        action={<Link href="/admin/clients/new" className="btn btn-primary">إنشاء حساب عميل</Link>} />

      {(o.unmatched > 0 || o.subsPending > 0) && (
        <ul className="mb-6 space-y-2">
          {o.unmatched > 0 && <li><Link href="/admin/payments" className="alert alert-info block font-medium hover:underline">{o.unmatched} مدفوعات من سلة تحتاج ربط يدوي</Link></li>}
          {o.subsPending > 0 && <li><Link href="/admin/subscriptions?status=pending_payment" className="alert alert-info block hover:underline">{o.subsPending} طلبات اشتراك بانتظار الدفع</Link></li>}
        </ul>
      )}

      {/* Money */}
      <section aria-labelledby="money" className="mb-10">
        <h2 id="money" className="mb-3 text-xl">الفلوس</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="إيراد الشهر" value={sar(o.revenueMonth)}
            sub={growth == null ? `الشهر الماضي ${sar(o.revenueLastMonth)}` : `${growth >= 0 ? "▲" : "▼"} ${Math.abs(growth)}% عن الشهر الماضي`} />
          <Stat label="أجور المعلمات للشهر" value={sar(o.costMonth)} sub={`${o.costMonth / o.rate} حصة × ${o.rate} ﷼`} tone="sky" />
          <Stat label="صافي الشهر" value={sar(o.profitMonth)} tone={o.profitMonth >= 0 ? "ok" : "bad"} sub="الإيراد ناقص أجور المعلمات" />
          <Stat label="مستحق للمعلمات (غير مدفوع)" value={sar(o.outstanding)} tone={o.outstanding > 0 ? "bad" : "ok"}
            sub={<Link href="/admin/teachers/stats" className="underline">التفاصيل لكل معلمة</Link>} />
        </div>
        <p className="mt-3 text-sm text-muted">إجمالي الإيراد منذ البداية {sar(o.revenueTotal)} · إجمالي المدفوع للمعلمات {sar(o.paidTotal)}</p>
      </section>

      {/* Subscribers */}
      <section aria-labelledby="subs" className="mb-10">
        <h2 id="subs" className="mb-3 text-xl">المشتركين</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="اشتراكات فعّالة الآن" value={o.subsActive} sub={`لـ ${o.parentsActive} ولي أمر`} />
          <Stat label="اشتركوا هذا الشهر" value={o.subsPaidMonth} sub={`الإجمالي منذ البداية ${o.subsPaidTotal}`} />
          <Stat label="أولياء الأمور المسجلين" value={o.parents} sub={`${o.parentsNewMonth} جديد هذا الشهر`} />
          <Stat label="حصص قادمة" value={o.upcoming} sub={`تمت هذا الشهر ${o.completedMonth}`} tone="sky" />
        </div>
        <div className="panel mt-4 overflow-x-auto">
          <table className="table">
            <thead><tr><th>الباقة</th><th>السعر</th><th>فعّال الآن</th><th>اشتركوا هذا الشهر</th><th>إجمالي الاشتراكات</th><th>إجمالي الإيراد</th></tr></thead>
            <tbody>{plans.map((p) => (
              <tr key={p.code}><td className="font-medium">{p.name_ar}</td><td>{sar(Number(p.price_sar))}</td><td>{p.active}</td>
                <td>{p.paid_month}</td><td>{p.paid_total}</td><td>{sar(Number(p.revenue_total))}</td></tr>
            ))}</tbody>
          </table>
        </div>
      </section>

      {/* 6-month finance */}
      <section aria-labelledby="fin" className="mb-10">
        <h2 id="fin" className="mb-3 text-xl">آخر 6 أشهر</h2>
        <div className="panel overflow-x-auto p-2">
          <table className="table">
            <thead><tr><th>الشهر</th><th className="w-[40%]">الإيراد مقابل الأجور</th><th>اشتراكات</th><th>حصص</th><th>الصافي</th></tr></thead>
            <tbody>{finance.map((f) => (
              <tr key={f.month}>
                <td className="whitespace-nowrap">{monthName(f.month)}</td>
                <td>
                  <div className="space-y-1" aria-label={`إيراد ${sar(f.revenue)}، أجور ${sar(f.cost)}`}>
                    <div className="flex items-center gap-2"><div className="h-2.5 rounded-full bg-lav-400" style={{ width: `${(f.revenue / maxRev) * 100}%`, minWidth: f.revenue ? 4 : 0 }} /><span className="text-xs text-muted">{sar(f.revenue)}</span></div>
                    <div className="flex items-center gap-2"><div className="h-2.5 rounded-full bg-sky-300" style={{ width: `${(f.cost / maxRev) * 100}%`, minWidth: f.cost ? 4 : 0 }} /><span className="text-xs text-muted">{sar(f.cost)}</span></div>
                  </div>
                </td>
                <td>{f.subs}</td><td>{f.sessions}</td>
                <td className={f.profit >= 0 ? "text-ok" : "text-bad"}>{sar(f.profit)}</td>
              </tr>
            ))}</tbody>
          </table>
          <p className="px-3 pb-2 text-xs text-muted"><span className="inline-block h-2 w-3 rounded bg-lav-400" /> الإيراد · <span className="inline-block h-2 w-3 rounded bg-sky-300" /> أجور المعلمات</p>
        </div>
      </section>

      {/* Teacher activation */}
      <section aria-labelledby="act" className="mb-10">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="act" className="text-xl">تفعيل المعلمات {pendingTeachers.length > 0 && <span className="chip chip-warn mr-2">{pendingTeachers.length} بانتظار</span>}</h2>
          <Link href="/admin/teachers" className="text-[.95rem] text-lav-700 underline">كل المعلمات ({o.teachersActive} معتمدة)</Link>
        </div>
        {pendingTeachers.length === 0 ? <p className="panel p-5 text-muted">ما فيه طلبات انضمام جديدة.</p> : (
          <div className="space-y-3">
            {pendingTeachers.map((t) => (
              <div key={t.user_id} className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{t.full_name}</p>
                  <p className="text-[.93rem] text-muted">{t.subjects.map((s) => SUBJECTS[s]).join("، ")} · {t.qualification} · {t.years_experience} سنوات
                    {!t.teams_link && <span className="text-bad"> · بدون رابط Teams</span>}</p>
                  <p className="text-[.9rem]">{t.cv_id ? <a href={`/api/documents/${t.cv_id}`} className="text-lav-700 underline">تحميل السيرة الذاتية</a> : <span className="text-bad">بدون سيرة ذاتية</span>}</p>
                </div>
                <div className="flex gap-2">
                  <Link href="/admin/teachers" className="btn btn-ghost btn-sm">الملف كامل</Link>
                  <form action={setTeacherStatusAction}><input type="hidden" name="id" value={t.user_id} /><input type="hidden" name="op" value="approve" />
                    <button className="btn btn-primary btn-sm">تفعيل</button></form>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-xl">حصص اليوم ({todays.length})</h2>
        {todays.length === 0 ? <p className="panel p-5 text-muted">ما فيه حصص اليوم.</p>
          : <div className="space-y-3">{todays.map((b) => <SessionCard key={b.id} b={b} viewer="admin" />)}</div>}
      </section>
    </>
  );
}
