import { REPORT_FIELDS, UNDERSTANDING, type SessionReport } from "@/lib/report";

const LEVEL_TONE: Record<string, string> = {
  excellent: "bg-emerald-50 text-emerald-800 border-emerald-200",
  good: "bg-sky-50 text-sky-900 border-sky-300",
  needs_work: "bg-amber-50 text-amber-900 border-amber-200",
};

/** The teacher's structured report, as the parent sees it. Also used for the landing-page sample. */
export function SessionReportCard({ report, title = "تقرير الحصة", meta }: { report: SessionReport; title?: string; meta?: string }) {
  return (
    <article className="rounded-2xl border border-line bg-white p-5 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg">{title}</h3>
          {meta && <p className="text-sm text-muted">{meta}</p>}
        </div>
        {report.understanding && (
          <span className={`rounded-full border px-3 py-1 text-sm ${LEVEL_TONE[report.understanding]}`}>
            {UNDERSTANDING[report.understanding]}
          </span>
        )}
      </header>
      <dl className="mt-4 grid gap-4 sm:grid-cols-2">
        {REPORT_FIELDS.filter((f) => report[f.key]).map((f) => (
          <div key={f.key} className={f.key === "covered" ? "sm:col-span-2" : ""}>
            <dt className="text-sm font-semibold text-lav-700">{f.label}</dt>
            <dd className="mt-1 whitespace-pre-line">{report[f.key]}</dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
