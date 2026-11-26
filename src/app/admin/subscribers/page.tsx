import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { decrypt } from "@/lib/crypto";
import { q } from "@/lib/db";
import { GRADES, SUBJECTS, TRACKS, type Subject, type Track } from "@/lib/domain";
import { sar } from "@/lib/owner";
import { displayPhone } from "@/lib/phone";
import { getPlans } from "@/lib/plans";
import { expireOverdue } from "@/lib/subscriptions";
import { shortDate } from "@/lib/time";

export const metadata = { title: "المشتركين" };

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<{ plan?: string; view?: string }> }) {
  await requirePerm("parents.view");
  await expireOverdue();
  const sp = await searchParams;
  const plans = await getPlans(true);
  const plan = plans.some((p) => p.code === sp.plan) ? sp.plan : "";
  const view = sp.view === "expiring" ? "expiring" : sp.view === "expired" ? "expired" : "active";

  const params: unknown[] = [];
  const where = [view === "expired" ? "s.status = 'expired'" : "s.status = 'active'"];
  if (view === "expiring") where.push("s.ends_at < now() + interval '5 days'");
  if (plan) { params.push(plan); where.push(`s.plan_code = $${params.length}`); }

  const rows = await q<{
    id: string; reference: string; plan_name: string; subject: Subject | null; track: Track; price_sar: string;
    sessions_total: number; used: string; starts_at: Date; ends_at: Date; parent_id: string; parent_name: string;
    email: string; phone_enc: string | null; student_name: string; grade: number; next_session: Date | null;
  }>(`
    SELECT s.id, s.reference, p.name_ar plan_name, s.subject, s.track, s.price_sar, s.sessions_total,
           (SELECT count(*) FROM bookings b WHERE b.subscription_id = s.id AND b.status IN ('scheduled','completed','student_absent')) used,
           s.starts_at, s.ends_at, u.id parent_id, u.full_name parent_name, u.email, u.phone_enc, st.full_name student_name, st.grade,
           (SELECT min(starts_at) FROM bookings b WHERE b.subscription_id = s.id AND b.status = 'scheduled' AND b.starts_at > now()) next_session
      FROM subscriptions s JOIN plans p ON p.code = s.plan_code JOIN users u ON u.id = s.parent_id JOIN students st ON st.id = s.student_id
     WHERE ${where.join(" AND ")}
     ORDER BY s.ends_at ${view === "expired" ? "DESC" : "ASC"} LIMIT 500`, params);

  const link = (p: { plan?: string; view?: string }) => {
    const u = new URLSearchParams();
    const m = { plan, view, ...p };
    if (m.plan) u.set("plan", m.plan);
    if (m.view && m.view !== "active") u.set("view", m.view);
    return `/admin/subscribers${u.size ? `?${u}` : ""}`;
  };
  const pill = (active: boolean) => `rounded-full px-4 py-1.5 text-[.93rem] ${active ? "bg-lav-700 text-white" : "bg-white text-muted ring-1 ring-line"}`;
  const totalValue = rows.reduce((a, r) => a + Number(r.price_sar), 0);

  return (
    <>
      <PageTitle title="المشتركين" sub={`${rows.length} اشتراك · قيمتها ${sar(totalValue)}`}
        action={<Link href="/admin/clients/new" className="btn btn-primary btn-sm">إنشاء حساب عميل</Link>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Link href={link({ view: "active" })} className={pill(view === "active")}>الفعّالين</Link>
        <Link href={link({ view: "expiring" })} className={pill(view === "expiring")}>ينتهون خلال 5 أيام</Link>
        <Link href={link({ view: "expired" })} className={pill(view === "expired")}>المنتهية (للتجديد)</Link>
      </div>
      <div className="mb-6 flex flex-wrap gap-2">
        <Link href={link({ plan: "" })} className={pill(!plan)}>كل الباقات</Link>
        {plans.map((p) => <Link key={p.code} href={link({ plan: p.code })} className={pill(plan === p.code)}>{p.name_ar}</Link>)}
      </div>

      {rows.length === 0 ? <Empty title="لا يوجد مشتركون بهذه التصفية" /> : (
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th>ولي الأمر</th><th>الطالب</th><th>الباقة</th><th>الحصص</th><th>الحصة القادمة</th><th>ينتهي</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const remaining = r.sessions_total - Number(r.used);
                const daysLeft = Math.ceil((r.ends_at.getTime() - Date.now()) / 86400_000);
                const phone = displayPhone(decrypt(r.phone_enc));
                return (
                  <tr key={r.id}>
                    <td>
                      <p className="font-medium">{r.parent_name}</p>
                      <p className="text-xs text-muted" dir="ltr">{phone || r.email}</p>
                      {phone && <a href={`https://wa.me/966${phone.slice(1)}`} target="_blank" rel="noopener noreferrer" className="text-xs text-sky-700 underline">واتساب</a>}
                    </td>
                    <td>{r.student_name}<p className="text-xs text-muted">{GRADES[r.grade]}</p></td>
                    <td>{r.plan_name}<p className="text-xs text-muted">{r.subject ? SUBJECTS[r.subject] : "كل المواد"} · {TRACKS[r.track].short} · <span dir="ltr">{r.reference}</span></p></td>
                    <td><span className="font-semibold">{remaining}</span> <span className="text-muted">/ {r.sessions_total} متبقية</span></td>
                    <td>{r.next_session ? shortDate(r.next_session) : <span className="text-muted">لم يحجز</span>}</td>
                    <td className={view !== "expired" && daysLeft <= 5 ? "font-semibold text-warn" : ""}>
                      {shortDate(r.ends_at)}{view !== "expired" && <p className="text-xs text-muted">بعد {daysLeft} يوم</p>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
