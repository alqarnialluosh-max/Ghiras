"use client";
import { useActionState, useState } from "react";
import { addLedgerEntryAction, voidLedgerEntryAction } from "../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";

export function AddEntryForm({ income, expense, today }: { income: string[]; expense: string[]; today: string }) {
  const [state, action] = useActionState(addLedgerEntryAction, {});
  const v = state.values ?? {};
  const [kind, setKind] = useState<"income" | "expense">((v.kind as "income" | "expense") ?? "expense");
  const [cat, setCat] = useState(v.category ?? "");
  const cats = kind === "income" ? income : expense;
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">النوع</legend>
        {(["expense", "income"] as const).map((k) => (
          <label key={k} className={`cursor-pointer rounded-xl border-[1.5px] px-4 py-2.5 text-center font-medium ${
            kind === k ? (k === "income" ? "border-ok bg-[#e3f4ec] text-ok" : "border-bad bg-[#fbe6e8] text-bad") : "border-line"}`}>
            <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => { setKind(k); setCat(""); }} className="sr-only" />
            {k === "income" ? "إيراد" : "مصروف"}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="category">التصنيف</label>
        <select id="category" name="category" className="input" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="" disabled>اختر التصنيف</option>
          {cats.map((c) => <option key={c} value={c}>{c}</option>)}
          <option value="__custom">تصنيف آخر...</option>
        </select>
        <FieldErrorText state={state} name="category" />
      </div>
      {cat === "__custom" && <Field name="custom_category" label="اسم التصنيف" state={state} />}
      <div className="grid grid-cols-2 gap-3">
        <Field name="amount_sar" label="المبلغ (ريال)" type="number" inputMode="decimal" state={state} />
        <Field name="entry_date" label="التاريخ" type="date" defaultValue={today} state={state} />
      </div>
      <Field name="description" label="الوصف" placeholder={kind === "income" ? "مثلاً: دفعة نقدية من ولي أمر" : "مثلاً: إعلان سناب شات لشهر ديسمبر"} state={state} />
      <Field name="salla_order_id" label="رقم طلب سلة (اختياري)" dir="ltr" state={state} />
      <SubmitButton className="btn btn-primary w-full" pending="جارٍ الحفظ...">سجّل {kind === "income" ? "الإيراد" : "المصروف"}</SubmitButton>
    </form>
  );
}

export function VoidEntryForm({ id }: { id: string }) {
  const [state, action] = useActionState(voidLedgerEntryAction, {});
  if (state.ok) return <span className="chip chip-ok">ملغى</span>;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted underline">إلغاء</summary>
      <form action={action} className="mt-2 flex flex-col gap-2">
        <input type="hidden" name="id" value={id} />
        <input name="reason" className="input min-h-[38px] py-1 text-sm" placeholder="سبب الإلغاء" required minLength={3} />
        <SubmitButton className="btn btn-ghost btn-sm" pending="...">تأكيد الإلغاء</SubmitButton>
        {state.error && <span className="text-bad">{state.error}</span>}
      </form>
    </details>
  );
}
