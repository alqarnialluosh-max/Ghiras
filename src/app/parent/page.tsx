import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { needsEmailVerification, requireRole } from "@/lib/auth";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { ParentRequests } from "@/components/ParentRequests";
import { SUB_STATUS, SUBJECTS, TRACKS } from "@/lib/domain";
import { getPlans } from "@/lib/plans";
import { bookingsFor, studentsOf } from "@/lib/queries";
import { parentSubscriptions, remainingFor } from "@/lib/subscriptions";
import { shortDate } from "@/lib/time";
import { one, q } from "@/lib/db";
import { AutoRefresh } from "@/components/AutoRefresh";
import { autoRenewAction } from "./actions";

const DONE: Record<string, [string, string]> = {
  renew_on: ["alert-ok", "شُغّل التجديد التلقائي. سنرسل لك قبل التجديد بثلاثة أيام موعده ومبلغه."],
  renew_off: ["alert-ok", "أُوقف التجديد التلقائي. يبقى اشتراكك الحالي كما هو حتى نهايته."],
  renew_error: ["alert-error", "تعذّر تغيير التجديد لهذا الاشتراك."],
};

export default async function ParentHome({ searchParams }: { searchParams: Promise<{ welcome?: string; done?: string }> }) {
  const user = await requireRole("parent");
  const { welcome, done } = await searchParams;
  const [students, subs, upcoming, plans, survey] = await Promise.all([
    studentsOf(user.id), parentSubscriptions(user.id), bookingsFor("parent", user.id, "upcoming", 5), getPlans(),
    one(`SELECT 1 FROM onboarding_surveys WHERE user_id = $1`, [user.id]),
  ]);
  const active = subs.filter((s) => s.status === "active");
  const pending = subs.filter((s) => s.status === "pending_payment");
  const remaining = await Promise.all(active.map((s) => remainingFor(s.id, s.sessions_total)));
  const now = Date.now();
  // Fresh purchase still waiting for Salla's confirmation → refresh the page so activation shows up by itself
  const waiting = pending.some((s) => now - s.created_at.getTime() < 3 * 3600_000 && !s.renewal_of);
  // Active (started) subscriptions with no session requested yet → push the parent to pick sessions
  const unbooked = active.length
    ? (await q<{ id: string }>(
        `SELECT s.id FROM subscriptions s WHERE s.id = ANY($1::uuid[]) AND s.starts_at <= now()
            AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.subscription_id = s.id)`, [active.map((s) => s.id)])).map((r) => r.id)
    : [];
  const fresh = active.find((s) => unbooked.includes(s.id));
  const renewalFor = (id: string) => subs.find((r) => r.renewal_of === id && (r.status === "pending_payment" || r.status === "active"));
  const first = user.full_name.split(" ")[0];

  return (
    <>
      <PageTitle title={`أهلاً ${first}`} sub={welcome ? "حسابك جاهز. الخطوة التالية: أضف ابنك أو ابنتك." : "هذه خلاصة حصص أبنائك."}
        action={active.length > 0 && <Link href="/parent/book" className="btn btn-primary">احجز حصة</Link>} />
      {(await needsEmailVerification(user)) && <VerifyEmailBanner email={user.email} />}
      {done && DONE[done] && <p role="status" className={`alert ${DONE[done][0]} mb-6`}>{DONE[done][1]}</p>}
      {waiting && <AutoRefresh seconds={10} />}
      {fresh && (
        <div className="panel mb-6 flex flex-col items-start gap-3 border-lav-300 bg-lav-100/60 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-medium">اشتراك {fresh.student_name} فعّال ✓</span> <span className="text-muted">الخطوة التالية: اختر مواعيد الحصص مع المعلمة.</span></p>
          <Link href={`/parent/book?sub=${fresh.id}`} className="btn btn-primary btn-sm">اختر مواعيد الحصص</Link>
        </div>
      )}
      <ParentRequests parentId={user.id} />

      {!survey && (
        <div className="panel mb-6 flex flex-col items-start gap-3 border-sky-300 bg-sky-50 p-5 sm:flex-row sm:items-center sm:justify-between">
          <p><span className="font-medium">أخبرنا عن هدفك في دقيقة واحدة</span> <span className="text-muted">لتبني المعلمة الحصص عليه من البداية.</span></p>
          <Link href="/parent/welcome" className="btn btn-sky btn-sm">ابدأ الاستبيان</Link>
        </div>
      )}

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
                  <p className="font-medium">{s.renewal_of ? "تجديد: " : ""}{s.plan_name} — {s.student_name}</p>
                  <p className="text-[.95rem] text-muted">
                    رقم الطلب <span dir="ltr" className="font-medium text-ink">{s.reference}</span> · يُفعَّل تلقائياً بعد الدفع ببريدك أو جوالك المسجل
                    {s.renewal_of ? " · يبدأ من يوم انتهاء الاشتراك الحالي" : ""}
                  </p>
                  {waiting && !s.renewal_of && <p className="mt-1 text-sm text-muted" aria-live="polite">دفعت؟ ستتحدث هذه الصفحة تلقائياً خلال ثوانٍ من وصول تأكيد سلة.</p>}
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
                  {s.starts_at && s.starts_at.getTime() > now ? <span className="chip">الشهر القادم</span> : <span className="chip chip-ok">{SUB_STATUS[s.status]}</span>}
                </div>
                <div className="mt-5 flex items-end justify-between">
                  <p><span className="font-display text-4xl text-lav-700">{remaining[i]}</span> <span className="text-muted">من {s.sessions_total} حصص متبقية</span></p>
                  <p className="text-sm text-muted">
                    {s.starts_at && s.starts_at.getTime() > now ? `يبدأ ${shortDate(s.starts_at)} · ` : ""}ينتهي {s.ends_at ? shortDate(s.ends_at) : ""}
                  </p>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-lav-100" aria-hidden="true">
                  <div className="h-full rounded-full bg-lav-400" style={{ width: `${(remaining[i] / s.sessions_total) * 100}%` }} />
                </div>
                {s.renewable && (
                  <form action={autoRenewAction} className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3 text-sm">
                    <input type="hidden" name="id" value={s.id} />
                    <input type="hidden" name="on" value={s.auto_renew ? "0" : "1"} />
                    <span>
                      التجديد التلقائي: <strong className={s.auto_renew ? "text-lav-700" : "text-muted"}>{s.auto_renew ? "مفعّل" : "موقوف"}</strong>
                      <span className="text-muted">
                        {renewalFor(s.id)?.status === "active" ? " · جُدّد للشهر القادم"
                          : s.auto_renew ? ` · نذكّرك قبل ${s.ends_at ? shortDate(s.ends_at) : "النهاية"} بثلاثة أيام` : ""}
                      </span>
                    </span>
                    <button className="btn btn-ghost btn-sm" type="submit">{s.auto_renew ? "إيقاف التجديد" : "تشغيل التجديد"}</button>
                  </form>
                )}
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
