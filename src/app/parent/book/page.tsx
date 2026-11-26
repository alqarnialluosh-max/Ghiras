import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { needsEmailVerification, requireRole } from "@/lib/auth";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { availableSlots, bookableDays, eligibleTeachers, type Sub } from "@/lib/booking";
import { GRADES, SUBJECT_KEYS, SUBJECTS, TRACKS, type Subject } from "@/lib/domain";
import { parentSubscriptions, remainingFor } from "@/lib/subscriptions";
import { keyLabel, minutesToLabel, riyadhDateKey } from "@/lib/time";
import { BookConfirm } from "./BookConfirm";

export const metadata = { title: "احجز حصة" };

type SP = { sub?: string; subject?: string; date?: string; minute?: string };

function StepTitle({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="mb-4 flex items-center gap-3 text-lg">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-lav-100 font-display text-lav-700">{n}</span>
      {children}
    </h2>
  );
}

function Choice({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link href={href} scroll={false} aria-current={active ? "true" : undefined}
      className={`rounded-xl border-[1.5px] px-4 py-2.5 text-[.95rem] transition-colors ${
        active ? "border-lav-600 bg-lav-700 text-white" : "border-line bg-white hover:border-lav-400"}`}>
      {children}
    </Link>
  );
}

export default async function BookPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireRole("parent");
  if (await needsEmailVerification(user)) {
    return (
      <>
        <PageTitle title="احجز حصة" />
        <VerifyEmailBanner email={user.email} blocking="أكّد بريدك قبل الحجز، لتصلك مواعيد الحصص وتذكيراتها" />
      </>
    );
  }
  const sp = await searchParams;
  const subs = (await parentSubscriptions(user.id)).filter((s) => s.status === "active");

  if (subs.length === 0) {
    return (
      <>
        <PageTitle title="احجز حصة" />
        <Empty title="تحتاج إلى اشتراك فعّال قبل الحجز">
          <Link href="/parent/subscribe" className="btn btn-primary btn-sm mt-3">اختر باقة</Link>
        </Empty>
      </>
    );
  }

  const sub = subs.find((s) => s.id === sp.sub) ?? (subs.length === 1 ? subs[0] : undefined);
  const remaining = sub ? await remainingFor(sub.id, sub.sessions_total) : 0;
  const subject = (sub?.subject ?? (SUBJECT_KEYS.includes(sp.subject as Subject) ? sp.subject : undefined)) as Subject | undefined;
  const link = (p: Partial<SP>) => {
    const u = new URLSearchParams();
    const merged = { sub: sub?.id, subject, date: sp.date, minute: sp.minute, ...p };
    for (const [k, v] of Object.entries(merged)) if (v) u.set(k, String(v));
    return `/parent/book?${u.toString()}`;
  };

  const days = sub ? bookableDays(sub as unknown as Sub) : [];
  const date = sp.date && days.includes(sp.date) ? sp.date : undefined;
  const slots = sub && subject && date
    ? await availableSlots({ sub: sub as unknown as Sub, studentId: sub.student_id, grade: sub.grade, subject, dateKey: date })
    : new Map<number, string[]>();
  const minute = sp.minute != null && slots.has(Number(sp.minute)) ? Number(sp.minute) : undefined;
  const teachers = sub && subject && minute != null
    ? (await eligibleTeachers(subject, sub.grade)).filter((t) => slots.get(minute)!.includes(t.id))
    : [];
  const noTeachersAtAll = sub && subject ? (await eligibleTeachers(subject, sub.grade)).length === 0 : false;

  return (
    <>
      <PageTitle title="احجز حصة" sub="اختر الوقت أولاً، ثم المعلمة المتاحة فيه." />
      <div className="space-y-10">
        <section>
          <StepTitle n={1}>الاشتراك</StepTitle>
          <div className="flex flex-wrap gap-2">
            {subs.map((s) => (
              <Choice key={s.id} href={`/parent/book?sub=${s.id}`} active={sub?.id === s.id}>
                {s.student_name} · {s.subject ? SUBJECTS[s.subject] : "كل المواد"}
              </Choice>
            ))}
          </div>
          {sub && (
            <p className="mt-3 text-[.95rem] text-muted">
              {GRADES[sub.grade]} · {TRACKS[sub.track].name} · متبقي <strong className="text-ink">{remaining}</strong> من {sub.sessions_total}
              {sub.weekly_limit ? ` · حتى ${sub.weekly_limit} حصص أسبوعياً` : ""}
            </p>
          )}
        </section>

        {sub && remaining <= 0 && (
          <p className="alert alert-info">استخدمت كل حصص هذا الاشتراك. <Link href="/parent/subscribe" className="underline">جدّد الاشتراك</Link></p>
        )}

        {sub && remaining > 0 && (
          <section>
            <StepTitle n={2}>المادة</StepTitle>
            <div className="flex flex-wrap gap-2">
              {(sub.subject ? [sub.subject] : SUBJECT_KEYS).map((s) => (
                <Choice key={s} href={link({ subject: s, date: undefined, minute: undefined })} active={subject === s}>{SUBJECTS[s]}</Choice>
              ))}
            </div>
            {noTeachersAtAll && <p className="alert alert-info mt-4">لا توجد حالياً معلمة متاحة لهذه المادة وهذا الصف. جرّب مادة أخرى أو تواصل معنا.</p>}
          </section>
        )}

        {sub && remaining > 0 && subject && !noTeachersAtAll && (
          <section>
            <StepTitle n={3}>اليوم</StepTitle>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {days.map((d) => {
                const isToday = d === riyadhDateKey(new Date());
                const [, m, day] = d.split("-");
                return (
                  <Link key={d} href={link({ date: d, minute: undefined })} scroll={false} aria-current={date === d ? "true" : undefined}
                    className={`flex min-w-[78px] flex-col items-center rounded-xl border-[1.5px] px-3 py-2 ${
                      date === d ? "border-lav-600 bg-lav-700 text-white" : "border-line bg-white hover:border-lav-400"}`}>
                    <span className="text-xs opacity-80">{isToday ? "اليوم" : keyLabel(d).split("،")[0]}</span>
                    <span className="font-display text-xl">{Number(day)}</span>
                    <span className="text-xs opacity-80">{Number(m)}/{d.slice(0, 4)}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {date && subject && (
          <section>
            <StepTitle n={4}>الوقت — {keyLabel(date)}</StepTitle>
            {slots.size === 0 ? (
              <p className="panel p-5 text-muted">لا توجد أوقات متاحة في هذا اليوم. جرّب يوماً آخر.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {[...slots.keys()].map((m) => (
                  <Choice key={m} href={link({ minute: String(m) })} active={minute === m}>{minutesToLabel(m)}</Choice>
                ))}
              </div>
            )}
          </section>
        )}

        {sub && subject && date && minute != null && (
          <section>
            <StepTitle n={5}>المعلمة وتفاصيل الحصة</StepTitle>
            <BookConfirm
              subscriptionId={sub.id} studentId={sub.student_id} subject={subject} date={date} minute={minute}
              summary={`${SUBJECTS[subject]} · ${keyLabel(date)} · ${minutesToLabel(minute)} · ساعة كاملة`}
              teachers={teachers.map((t) => ({ id: t.id, name: t.full_name, bio: t.bio, years: t.years_experience, qualification: t.qualification }))}
            />
          </section>
        )}
      </div>
    </>
  );
}
