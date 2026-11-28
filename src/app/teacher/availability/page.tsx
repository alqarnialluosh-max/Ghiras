import { PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { WEEKDAYS } from "@/lib/domain";
import { minutesToLabel, shortDate } from "@/lib/time";
import { deactivateAvailabilityAction, deactivateTimeOffAction } from "../actions";
import { AddRuleForm, TimeOffForm } from "./forms";

export const metadata = { title: "أوقاتي" };

export default async function AvailabilityPage() {
  const user = await requireRole("teacher");
  const [rules, offs] = await Promise.all([
    q<{ id: string; weekday: number; start_minute: number; end_minute: number }>(
      `SELECT id, weekday, start_minute, end_minute FROM availability_rules WHERE teacher_id = $1 AND active ORDER BY weekday, start_minute`, [user.id]),
    q<{ id: string; s: Date; e: Date; reason: string | null }>(
      `SELECT id, lower(during) s, upper(during) e, reason FROM availability_exceptions
        WHERE teacher_id = $1 AND active AND upper(during) > now() ORDER BY lower(during)`, [user.id]),
  ]);
  const byDay = WEEKDAYS.map((d, i) => ({ day: d, rules: rules.filter((r) => r.weekday === i) }));

  return (
    <>
      <PageTitle title="أوقاتي" sub="هذه الأوقات هي التي تظهر لأولياء الأمور. مدة الحصة ساعة وربع، وتبدأ على رأس الساعة أو نصفها." />
      <div className="grid gap-8 lg:grid-cols-[1.2fr_.8fr]">
        <section className="panel p-6" aria-labelledby="week">
          <h2 id="week" className="mb-4 text-xl">الجدول الأسبوعي</h2>
          <ul className="divide-y divide-line">
            {byDay.map(({ day, rules }) => (
              <li key={day} className="flex flex-wrap items-center gap-3 py-3">
                <span className="w-20 font-medium">{day}</span>
                {rules.length === 0 ? <span className="text-muted">غير متاحة</span> : rules.map((r) => (
                  <form key={r.id} action={deactivateAvailabilityAction} className="inline-flex">
                    <input type="hidden" name="id" value={r.id} />
                    <span className="chip chip-sky gap-2 py-1">
                      {minutesToLabel(r.start_minute)} – {minutesToLabel(r.end_minute)}
                      <button type="submit" aria-label={`إيقاف فترة ${day}`} className="rounded-full px-1 text-base leading-none hover:text-bad">×</button>
                    </span>
                  </form>
                ))}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted">إيقاف الفترة لا يلغي الحصص المحجوزة فيها، وإنما يمنع الحجوزات الجديدة فقط.</p>
        </section>
        <div className="space-y-8">
          <section className="panel p-6" aria-labelledby="add"><h2 id="add" className="mb-4 text-xl">إضافة فترة</h2><AddRuleForm /></section>
          <section className="panel p-6" aria-labelledby="off">
            <h2 id="off" className="mb-4 text-xl">إجازة</h2>
            <TimeOffForm />
            {offs.length > 0 && (
              <ul className="mt-5 space-y-2 border-t border-line pt-4">
                {offs.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-2 text-[.95rem]">
                    <span>{shortDate(o.s)} – {shortDate(new Date(o.e.getTime() - 1))}{o.reason ? ` · ${o.reason}` : ""}</span>
                    <form action={deactivateTimeOffAction}><input type="hidden" name="id" value={o.id} />
                      <button className="text-sm text-lav-700 underline" type="submit">إلغاء الإجازة</button></form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
