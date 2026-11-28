import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { needsEmailVerification, requireRole } from "@/lib/auth";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { one } from "@/lib/db";
import { bookingsFor, openRequestsFor } from "@/lib/queries";
import { teacherProfile, PAYABLE } from "@/lib/teachers";
import { site } from "@/config/site";
import { teamsAutoConfigured } from "@/lib/teams";

export default async function TeacherHome() {
  const user = await requireRole("teacher");
  const [profile, upcoming, rules, month, requests] = await Promise.all([
    teacherProfile(user.id),
    bookingsFor("teacher", user.id, "upcoming", 6),
    one<{ n: string }>(`SELECT count(*) n FROM availability_rules WHERE teacher_id = $1 AND active`, [user.id]),
    one<{ n: string; pay: string }>(
      `SELECT count(*) n,
              coalesce(sum(teacher_rate_sar), 0)
                + (SELECT coalesce(sum(amount_sar), 0) FROM teacher_bonuses WHERE teacher_id = $1 AND voided_at IS NULL
                     AND period_month = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')::date) pay
         FROM bookings WHERE teacher_id = $1 AND status = ANY($2::booking_status[])
          AND date_trunc('month', starts_at AT TIME ZONE 'Asia/Riyadh') = date_trunc('month', now() AT TIME ZONE 'Asia/Riyadh')`,
      [user.id, PAYABLE]),
    openRequestsFor("teacher", user.id),
  ]);
  const approved = !!profile?.approved_at && user.status === "active";
  const missing = [
    !profile?.teams_link && !teamsAutoConfigured() && { href: "/teacher/profile", text: "أضيفي رابط اجتماع Teams الدائم، فبدونه لن تظهري للحجز." },
    Number(rules?.n) === 0 && { href: "/teacher/availability", text: "حددي أوقاتك الأسبوعية المتاحة." },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <>
      <PageTitle title={`أهلاً ${user.full_name.split(" ")[0]}`} />
      {(await needsEmailVerification(user)) && <VerifyEmailBanner email={user.email} />}

      {!approved && (
        <div className="panel mb-8 border-sky-300 bg-sky-50 p-6">
          <p className="font-medium">طلبك قيد المراجعة</p>
          <p className="mt-1 text-muted">تراجع {site.supervisor.name} طلبك، وبعد الموافقة ستظهرين لأولياء الأمور. يمكنك تجهيز ملفك وأوقاتك من الآن.</p>
        </div>
      )}

      {requests.length > 0 && (
        <section aria-labelledby="req" className="mb-10">
          <h2 id="req" className="mb-3 text-xl">طلبات بانتظار ردكِ ({requests.length})</h2>
          <div className="space-y-3">{requests.map((b) => <SessionCard key={b.id} b={b} viewer="teacher" />)}</div>
        </section>
      )}

      {missing.length > 0 && (
        <ul className="mb-8 space-y-2">
          {missing.map((m) => (
            <li key={m.href}><Link href={m.href} className="alert alert-info block hover:underline">{m.text}</Link></li>
          ))}
        </ul>
      )}

      <div className={`mb-10 grid gap-4 ${approved ? "sm:grid-cols-3" : "sm:grid-cols-2"}`}>
        <div className="panel p-5"><p className="text-sm text-muted">حصص قادمة</p><p className="font-display text-3xl">{upcoming.length}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">حصص هذا الشهر</p><p className="font-display text-3xl">{month?.n ?? 0}</p></div>
        {approved && <div className="panel p-5"><p className="text-sm text-muted">مستحق هذا الشهر</p><p className="font-display text-3xl">{Number(month?.pay ?? 0)} <span className="text-base text-muted">ريال</span></p></div>}
      </div>

      <section aria-labelledby="up">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up" className="text-xl">حصصك القادمة</h2>
          <Link href="/teacher/sessions" className="text-[.95rem] text-lav-700 underline">كل الحصص</Link>
        </div>
        {upcoming.length ? <div className="space-y-3">{upcoming.map((b) => <SessionCard key={b.id} b={b} viewer="teacher" />)}</div>
          : <Empty title="لا توجد حصص قادمة حالياً" />}
      </section>
    </>
  );
}
