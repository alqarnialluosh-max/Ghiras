import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { requireRole } from "@/lib/auth";
import { SUB_STATUS, SUBJECTS, TRACKS } from "@/lib/domain";
import { getPlans } from "@/lib/plans";
import { bookingsFor, studentsOf } from "@/lib/queries";
import { parentSubscriptions, remainingFor } from "@/lib/subscriptions";
import { shortDate } from "@/lib/time";

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireRole("parent");
  const { welcome } = await searchParams;
  const [students, subs, upcoming, plans] = await Promise.all([
    studentsOf(user.id), parentSubscriptions(user.id), bookingsFor("parent", user.id, "upcoming", 5), getPlans(),
  ]);
  const active = subs.filter((s) => s.status === "active");
  const pending = subs.filter((s) => s.status === "pending_payment");
  const remaining = await Promise.all(active.map((s) => remainingFor(s.id, s.sessions_total)));
  const first = user.full_name.split(" ")[0];

  return (
    <>
      <PageTitle title={`أهلاً ${first}`} sub={welcome ? "حسابك جاهز. الخطوة التالية: أضف ابنك أو ابنتك." : "هذه خلاصة حصص أبنائك."}
        action={active.length > 0 && <Link href="/parent/book" className="btn btn-primary">احجز حصة</Link>} />

      {students.length === 0 && (
        <div className="panel mb-8 flex flex-col items-start gap-4 bg-lav-100/50 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">لم تُضف أي طالب بعد</p>
            <p className="text-muted">أضف اسم الطالب وصفه الدراسي لتتمكن من الاشتراك والحجز.</p>
          </div>
          <Link href="/parent/students" className="btn btn-primary">أضف طالباً</Link>
        </div>
      )}

      {pending.length > 0 && (
        <section className="mb-8 space-y-3" aria-labelledby="pending-h">
          <h2 id="pending-h" className="text-xl">بانتظار تأكيد الدفع</h2>
          {pending.map((s) => {
            const url = plans.find((p) => p.code === s.plan_code)?.salla_url;
            return (
              <div key={s.id} className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">{s.plan_name} — {s.student_name}</p>
                  <p className="text-[.95rem] text-muted">
                    رقم الطلب <span dir="ltr" className="font-medium text-ink">{s.reference}</span> · يُفعَّل تلقائياً بعد الدفع ببريدك أو جوالك المسجل
                  </p>
                </div>
                {url && <a href={url} className="btn btn-ghost btn-sm" rel="noopener">أكمل الدفع في سلة</a>}
              </div>
            );
          })}
        </section>
      )}

      <section className="mb-10" aria-labelledby="active-h">
        <h2 id="active-h" className="mb-3 text-xl">الاشتراكات الفعّالة</h2>
        {active.length === 0 ? (
          <Empty title="ليس لديك اشتراك فعّال">
            <Link href="/parent/subscribe" className="btn btn-primary btn-sm mt-3">اختر باقة</Link>
          </Empty>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((s, i) => (
              <article key={s.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.student_name}</p>
                    <p className="text-[.95rem] text-muted">
                      {s.plan_name} · {s.subject ? SUBJECTS[s.subject] : "كل المواد"} · {TRACKS[s.track].name}
                    </p>
                  </div>
                  <span className="chip chip-ok">{SUB_STATUS[s.status]}</span>
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <p><span className="font-display text-4xl text-lav-700">{remaining[i]}</span> <span className="text-muted">من {s.sessions_total} حصص متبقية</span></p>
                  <p className="text-sm text-muted">ينتهي {s.ends_at ? shortDate(s.ends_at) : ""}</p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-lav-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-lav-400" style={{ width: `${(remaining[i] / s.sessions_total) * 100}%` }} />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section aria-labelledby="up-h">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="up-h" className="text-xl">الحصص القادمة</h2>
          <Link href="/parent/sessions" className="text-[.95rem] text-lav-700 underline">كل الحصص</Link>
        </div>
        {upcoming.length === 0 ? (
          <Empty title="لا توجد حصص قادمة">{active.length > 0 && "احجز أول حصة من زر «احجز حصة»."}</Empty>
        ) : (
          <div className="space-y-3">{upcoming.map((b) => <SessionCard key={b.id} b={b} viewer="parent" />)}</div>
        )}
      </section>
    </>
  );
}
