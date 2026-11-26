import { Empty, PageTitle } from "@/components/DashShell";
import { q } from "@/lib/db";
import { SURVEY, label, type SurveyKey } from "@/lib/survey";
import { shortDate } from "@/lib/time";

export const metadata = { title: "استبيان التسجيل" };

function Bars({ title, rows, total }: { title: string; rows: { value: string; n: number }[]; total: number }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <section className="panel p-6">
      <h2 className="mb-4 text-lg">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-muted">لا توجد إجابات بعد.</p> : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.value}>
              <div className="flex justify-between text-[.95rem]"><span>{r.value}</span>
                <span className="font-medium">{r.n} <span className="text-xs text-muted">({Math.round((r.n / Math.max(1, total)) * 100)}%)</span></span></div>
              <div className="mt-1 h-2 rounded-full bg-wash"><div className="h-2 rounded-full bg-lav-400" style={{ width: `${(r.n / max) * 100}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function InsightsPage() {
  const [single, multi, recent, totals] = await Promise.all([
    q<{ k: string; value: string; n: string }>(`
      SELECT 'source' k, source value, count(*) n FROM onboarding_surveys GROUP BY source
      UNION ALL SELECT 'goal', goal, count(*) FROM onboarding_surveys GROUP BY goal`),
    q<{ k: string; value: string; n: string }>(`
      SELECT 'needs' k, unnest(needs) value, count(*) n FROM onboarding_surveys GROUP BY 2
      UNION ALL SELECT 'expectations', unnest(expectations), count(*) FROM onboarding_surveys GROUP BY 2`),
    q<{ full_name: string; source: string; source_other: string | null; goal: string; goal_other: string | null;
        needs: string[]; needs_other: string | null; expectations: string[]; expectation_other: string | null; created_at: Date; subscribed: boolean }>(`
      SELECT u.full_name, s.*, EXISTS (SELECT 1 FROM subscriptions x WHERE x.parent_id = u.id AND x.starts_at IS NOT NULL) subscribed
        FROM onboarding_surveys s JOIN users u ON u.id = s.user_id ORDER BY s.created_at DESC LIMIT 100`),
    q<{ answered: string; parents: string; skipped: string }>(`
      SELECT (SELECT count(*) FROM onboarding_surveys) answered, (SELECT count(*) FROM users WHERE role = 'parent') parents,
             (SELECT count(*) FROM users WHERE role = 'parent' AND survey_skipped_at IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM onboarding_surveys s WHERE s.user_id = users.id)) skipped`),
  ]);
  const t = totals[0];
  const answered = Number(t?.answered ?? 0);
  const rows = (k: SurveyKey) => [...single, ...multi].filter((r) => r.k === k)
    .map((r) => ({ value: r.value === "other" ? "أخرى (كتابة)" : label(k, r.value), n: Number(r.n) })).sort((a, b) => b.n - a.n);
  // Conversion by source: who actually paid
  const bySource = new Map<string, { all: number; paid: number }>();
  for (const r of recent) {
    const s = bySource.get(r.source) ?? { all: 0, paid: 0 };
    s.all++; if (r.subscribed) s.paid++; bySource.set(r.source, s);
  }

  return (
    <>
      <PageTitle title="استبيان التسجيل" sub={`أجاب ${answered} من ${t?.parents ?? 0} ولي أمر · أجّل ${t?.skipped ?? 0}`} />
      <div className="mb-8 grid gap-5 lg:grid-cols-2">
        <Bars title={SURVEY.source.title} rows={rows("source")} total={answered} />
        <Bars title={SURVEY.goal.title} rows={rows("goal")} total={answered} />
        <Bars title={SURVEY.needs.title} rows={rows("needs")} total={answered} />
        <Bars title={SURVEY.expectations.title} rows={rows("expectations")} total={answered} />
      </div>

      {bySource.size > 0 && (
        <section className="mb-8">
          <h2 className="mb-3 text-xl">أي قناة تجلب مشتركين فعلاً؟</h2>
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>القناة</th><th>سجّلوا</th><th>اشتركوا</th><th>نسبة التحويل</th></tr></thead>
              <tbody>{[...bySource.entries()].sort((a, b) => b[1].paid - a[1].paid).map(([src, v]) => (
                <tr key={src}><td>{src === "other" ? "أخرى" : label("source", src)}</td><td>{v.all}</td><td>{v.paid}</td>
                  <td className="font-medium">{Math.round((v.paid / v.all) * 100)}%</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-muted">محسوبة على آخر 100 إجابة.</p>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-xl">آخر الإجابات</h2>
        {recent.length === 0 ? <Empty title="لا توجد إجابات بعد" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>ولي الأمر</th><th>عرفنا من</th><th>الهدف</th><th>يحتاج</th><th>يتوقع</th></tr></thead>
              <tbody>{recent.map((r, i) => (
                <tr key={i}>
                  <td><p className="font-medium">{r.full_name}</p><p className="text-xs text-muted">{shortDate(r.created_at)}{r.subscribed ? " · مشترك" : ""}</p></td>
                  <td>{r.source === "other" ? r.source_other : label("source", r.source)}</td>
                  <td>{r.goal === "other" ? r.goal_other : label("goal", r.goal)}</td>
                  <td className="text-sm">{r.needs.filter((n) => n !== "other").map((n) => label("needs", n)).concat(r.needs_other ? [r.needs_other] : []).join("، ")}</td>
                  <td className="text-sm">{r.expectations.filter((n) => n !== "other").map((n) => label("expectations", n)).concat(r.expectation_other ? [r.expectation_other] : []).join("، ")}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
