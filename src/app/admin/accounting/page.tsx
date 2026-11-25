import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { site } from "@/config/site";
import {
  EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryTotals, getSetting, ledgerEntries, monthlyPnL,
} from "@/lib/accounting";
import { sar } from "@/lib/owner";
import { addDaysKey, riyadhDateKey } from "@/lib/time";
import { updateFeeSettingsAction } from "../actions";
import { AddEntryForm, VoidEntryForm } from "./forms";

export const metadata = { title: "المحاسبة" };

const SOURCE: Record<string, [string, string]> = {
  manual: ["يدوي", ""], subscription: ["سلة / اشتراك", "chip-sky"], salla_fee: ["رسوم سلة", "chip-sky"], teacher_payout: ["أجر معلمة", "chip-sky"],
};
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthName = (k: string) => `${MONTHS[Number(k.slice(5, 7)) - 1]} ${k.slice(0, 4)}`;

function periodOf(sp: { p?: string; from?: string; to?: string }, today: string) {
  const y = today.slice(0, 4), m = today.slice(5, 7);
  const monthStart = `${y}-${m}-01`;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  switch (sp.p) {
    case "last": {
      const lastEnd = addDaysKey(monthStart, -1);
      return { from: `${lastEnd.slice(0, 7)}-01`, to: lastEnd, label: "الشهر الماضي" };
    }
    case "year": return { from: `${y}-01-01`, to: today, label: `سنة ${y}` };
    case "all": return { from: "2020-01-01", to: today, label: "منذ البداية" };
    case "custom":
      if (re.test(sp.from ?? "") && re.test(sp.to ?? "")) return { from: sp.from!, to: sp.to!, label: `${sp.from} — ${sp.to}` };
      return { from: monthStart, to: today, label: "هذا الشهر" };
    default: return { from: monthStart, to: today, label: "هذا الشهر" };
  }
}

export default async function AccountingPage({ searchParams }: {
  searchParams: Promise<{ p?: string; from?: string; to?: string; kind?: string; cat?: string; voided?: string }>;
}) {
  const sp = await searchParams;
  const today = riyadhDateKey(new Date());
  const period = periodOf(sp, today);
  const kind = sp.kind === "income" || sp.kind === "expense" ? sp.kind : undefined;
  const [rows, cats, pnl, feePct, feeFixed] = await Promise.all([
    ledgerEntries({ from: period.from, to: period.to, kind, category: sp.cat, includeVoided: sp.voided === "1" }),
    categoryTotals(period.from, period.to), monthlyPnL(12),
    getSetting("salla_fee_percent"), getSetting("salla_fee_fixed_sar"),
  ]);
  const income = cats.filter((c) => c.kind === "income").reduce((a, c) => a + Number(c.total), 0);
  const expense = cats.filter((c) => c.kind === "expense").reduce((a, c) => a + Number(c.total), 0);
  const net = income - expense;
  const margin = income > 0 ? Math.round((net / income) * 100) : null;
  const maxCat = Math.max(1, ...cats.map((c) => Number(c.total)));
  const pills = [["", "هذا الشهر"], ["last", "الشهر الماضي"], ["year", "هذه السنة"], ["all", "منذ البداية"]];
  const qs = (extra: Record<string, string | undefined>) => {
    const u = new URLSearchParams();
    const m: Record<string, string | undefined> = { p: sp.p, from: sp.from, to: sp.to, kind, cat: sp.cat, voided: sp.voided, ...extra };
    for (const [k, v] of Object.entries(m)) if (v) u.set(k, v);
    return `/admin/accounting${u.size ? `?${u}` : ""}`;
  };

  return (
    <>
      <PageTitle title="المحاسبة" sub={<>الإيرادات والمصروفات · {period.label}. إيرادات سلة وأجور المعلمات تنزل تلقائياً، والباقي تضيفه يدوياً.</>}
        action={<a href={`/admin/accounting/export?from=${period.from}&to=${period.to}`} className="btn btn-ghost">تصدير Excel (CSV)</a>} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {pills.map(([k, l]) => (
          <Link key={k} href={qs({ p: k || undefined, from: undefined, to: undefined })}
            className={`rounded-full px-4 py-1.5 text-[.93rem] ${(sp.p ?? "") === k ? "bg-lav-700 text-white" : "bg-white text-muted ring-1 ring-line"}`}>{l}</Link>
        ))}
        <form className="flex flex-wrap items-center gap-2 md:mr-auto">
          <input type="hidden" name="p" value="custom" />
          <input type="date" name="from" defaultValue={period.from} className="input min-h-[38px] w-auto py-1" aria-label="من" />
          <input type="date" name="to" defaultValue={period.to} className="input min-h-[38px] w-auto py-1" aria-label="إلى" />
          <button className="btn btn-ghost btn-sm">عرض الفترة</button>
        </form>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5"><p className="text-sm text-muted">الإيرادات</p><p className="font-display text-3xl text-ok">{sar(income)}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">المصروفات</p><p className="font-display text-3xl text-bad">{sar(expense)}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">صافي الربح</p><p className={`font-display text-3xl ${net >= 0 ? "text-ok" : "text-bad"}`}>{sar(net)}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">هامش الربح</p><p className="font-display text-3xl">{margin == null ? "—" : `${margin}%`}</p></div>
      </div>

      <div className="mb-10 grid gap-8 lg:grid-cols-[1.25fr_.75fr]">
        <div className="space-y-8">
          <section aria-labelledby="cats">
            <h2 id="cats" className="mb-3 text-xl">حسب التصنيف</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(["income", "expense"] as const).map((k) => (
                <div key={k} className="panel p-5">
                  <h3 className={`mb-3 ${k === "income" ? "text-ok" : "text-bad"}`}>{k === "income" ? "الإيرادات" : "المصروفات"}</h3>
                  {cats.filter((c) => c.kind === k).length === 0 ? <p className="text-sm text-muted">لا يوجد في هذه الفترة.</p> : (
                    <ul className="space-y-3">
                      {cats.filter((c) => c.kind === k).map((c) => (
                        <li key={c.category}>
                          <Link href={qs({ kind: k, cat: c.category })} className="flex justify-between text-[.95rem] hover:underline">
                            <span>{c.category} <span className="text-xs text-muted">({c.n})</span></span><span className="font-medium">{sar(Number(c.total))}</span>
                          </Link>
                          <div className="mt-1 h-2 rounded-full bg-wash"><div className={`h-2 rounded-full ${k === "income" ? "bg-lav-400" : "bg-sky-300"}`} style={{ width: `${(Number(c.total) / maxCat) * 100}%` }} /></div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="pnl">
            <h2 id="pnl" className="mb-3 text-xl">الأرباح والخسائر — آخر 12 شهر</h2>
            <div className="panel overflow-x-auto">
              <table className="table">
                <thead><tr><th>الشهر</th><th>الإيرادات</th><th>المصروفات</th><th>الصافي</th></tr></thead>
                <tbody>{pnl.map((r) => {
                  const n = Number(r.income) - Number(r.expense);
                  return (
                    <tr key={r.month}><td>{monthName(r.month)}</td><td className="text-ok">{sar(Number(r.income))}</td>
                      <td className="text-bad">{sar(Number(r.expense))}</td><td className={`font-medium ${n >= 0 ? "text-ok" : "text-bad"}`}>{sar(n)}</td></tr>
                  );
                })}</tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-6" aria-labelledby="add">
            <h2 id="add" className="mb-4 text-xl">قيد جديد</h2>
            <AddEntryForm income={INCOME_CATEGORIES} expense={EXPENSE_CATEGORIES} today={today} />
          </section>
          <section className="panel p-6" aria-labelledby="fees">
            <h2 id="fees" className="mb-1 text-xl">ربط سلة</h2>
            <p className="mb-4 text-sm text-muted">
              كل دفعة تأكدت من سلة تنزل إيراد تلقائياً. وإذا حطيت نسبة رسوم بوابة الدفع، تنحسب عليها رسوم تقديرية كمصروف.
              {site.sallaStore && <> المتجر: <a href={site.sallaStore} target="_blank" rel="noopener noreferrer" className="text-lav-700 underline" dir="ltr">{site.sallaStore.replace("https://", "")}</a></>}
            </p>
            <ActionForm action={updateFeeSettingsAction} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="field"><label htmlFor="pct">نسبة الرسوم %</label>
                  <input id="pct" name="salla_fee_percent" type="number" step="0.01" min={0} max={20} defaultValue={feePct} className="input" /></div>
                <div className="field"><label htmlFor="fixed">رسوم ثابتة (ريال)</label>
                  <input id="fixed" name="salla_fee_fixed_sar" type="number" step="0.01" min={0} max={100} defaultValue={feeFixed} className="input" /></div>
              </div>
              <p className="hint">انسخ النسبة من فاتورة سلة أو إعدادات «سلة باي».</p>
              <SubmitButton className="btn btn-ghost btn-sm">حفظ</SubmitButton>
            </ActionForm>
          </section>
        </aside>
      </div>

      <section aria-labelledby="entries">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 id="entries" className="text-xl">القيود ({rows.length})</h2>
          <div className="flex flex-wrap gap-2 text-[.93rem]">
            {[["", "الكل"], ["income", "الإيرادات"], ["expense", "المصروفات"]].map(([k, l]) => (
              <Link key={k} href={qs({ kind: k || undefined, cat: undefined })}
                className={`rounded-full px-3 py-1 ${(kind ?? "") === k && !sp.cat ? "bg-lav-100 text-lav-700" : "text-muted"}`}>{l}</Link>
            ))}
            {sp.cat && <Link href={qs({ cat: undefined })} className="chip">{sp.cat} ×</Link>}
            <Link href={qs({ voided: sp.voided === "1" ? undefined : "1" })} className="rounded-full px-3 py-1 text-muted underline">
              {sp.voided === "1" ? "إخفاء الملغاة" : "إظهار الملغاة"}</Link>
          </div>
        </div>
        <div className="panel overflow-x-auto">
          <table className="table">
            <thead><tr><th>التاريخ</th><th>التصنيف</th><th>الوصف</th><th>المصدر</th><th>المبلغ</th><th></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={6} className="text-muted">لا توجد قيود في هذه الفترة.</td></tr>}
              {rows.map((r) => (
                <tr key={r.id} className={r.voided_at ? "opacity-50" : ""}>
                  <td className="whitespace-nowrap" dir="ltr">{r.entry_date}</td>
                  <td>{r.category}</td>
                  <td className="max-w-sm">
                    <span className={r.voided_at ? "line-through" : ""}>{r.description}</span>
                    <p className="text-xs text-muted">{r.created_by_name ?? "النظام"}{r.voided_at ? ` · ألغاه ${r.voided_by_name}: ${r.void_reason}` : ""}</p>
                  </td>
                  <td><span className={`chip ${SOURCE[r.source]?.[1] ?? ""}`}>{SOURCE[r.source]?.[0] ?? r.source}</span></td>
                  <td className={`whitespace-nowrap font-semibold ${r.kind === "income" ? "text-ok" : "text-bad"}`}>{r.kind === "income" ? "+" : "−"}{sar(Number(r.amount_sar))}</td>
                  <td>{!r.voided_at && <VoidEntryForm id={r.id} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-muted">القيود ما تنحذف ولا تنعدل. إذا فيه خطأ، ألغِ القيد مع كتابة السبب وسجّل قيد صحيح.</p>
      </section>
    </>
  );
}
