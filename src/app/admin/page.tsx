import Link from "next/link";
import { PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { one } from "@/lib/db";
import { env } from "@/lib/env";
import { allBookings } from "@/lib/queries";
import { expireOverdue } from "@/lib/subscriptions";
import { riyadhDateKey, riyadhToUtc, addDaysKey } from "@/lib/time";

export default async function AdminHome() {
  await expireOverdue();
  const today = riyadhDateKey(new Date());
  const [c, todays] = await Promise.all([
    one<{ pending_teachers: string; pending_subs: string; unmatched: string; active_subs: string; parents: string;
          month_revenue: string; month_sessions: string }>(`
      SELECT
        (SELECT count(*) FROM users WHERE role='teacher' AND status='pending') pending_teachers,
        (SELECT count(*) FROM subscriptions WHERE status='pending_payment') pending_subs,
        (SELECT count(*) FROM salla_events WHERE match_status='unmatched') unmatched,
        (SELECT count(*) FROM subscriptions WHERE status='active') active_subs,
        (SELECT count(*) FROM users WHERE role='parent') parents,
        (SELECT coalesce(sum(price_sar),0) FROM subscriptions WHERE starts_at IS NOT NULL
           AND date_trunc('month', starts_at AT TIME ZONE 'Asia/Riyadh') = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')) month_revenue,
        (SELECT count(*) FROM bookings WHERE status IN ('completed','student_absent')
           AND date_trunc('month', starts_at AT TIME ZONE 'Asia/Riyadh') = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')) month_sessions`),
    allBookings({ from: riyadhToUtc(today, 0), to: riyadhToUtc(addDaysKey(today, 1), 0) }),
  ]);
  const revenue = Number(c?.month_revenue ?? 0);
  const cost = Number(c?.month_sessions ?? 0) * env.teacherRateSar;
  const todo = [
    Number(c?.pending_teachers) > 0 && { href: "/admin/teachers", text: `${c!.pending_teachers} طلبات انضمام معلمات بانتظار المراجعة` },
    Number(c?.unmatched) > 0 && { href: "/admin/payments", text: `${c!.unmatched} مدفوعات من سلة ما تطابقت تلقائياً` },
    Number(c?.pending_subs) > 0 && { href: "/admin/subscriptions?status=pending_payment", text: `${c!.pending_subs} اشتراكات بانتظار تأكيد الدفع` },
  ].filter(Boolean) as { href: string; text: string }[];

  const stats = [
    ["اشتراكات فعّالة", c?.active_subs], ["أولياء أمور", c?.parents],
    ["إيراد الشهر", `${revenue.toLocaleString("en-US")} ر.س`], ["أجور المعلمات للشهر", `${cost.toLocaleString("en-US")} ر.س`],
  ];
  return (
    <>
      <PageTitle title="نظرة عامة" />
      {todo.length > 0 && (
        <ul className="mb-8 space-y-2">{todo.map((t) => (
          <li key={t.href}><Link href={t.href} className="alert alert-info block font-medium hover:underline">{t.text}</Link></li>
        ))}</ul>
      )}
      <div className="mb-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(([l, v]) => (
          <div key={String(l)} className="panel p-5"><p className="text-sm text-muted">{l}</p><p className="font-display text-3xl">{v ?? 0}</p></div>
        ))}
      </div>
      <section>
        <h2 className="mb-3 text-xl">حصص اليوم ({todays.length})</h2>
        {todays.length === 0 ? <p className="panel p-5 text-muted">ما فيه حصص اليوم.</p>
          : <div className="space-y-3">{todays.map((b) => <SessionCard key={b.id} b={b} viewer="admin" />)}</div>}
      </section>
    </>
  );
}
