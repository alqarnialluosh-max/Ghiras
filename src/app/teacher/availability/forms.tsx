"use client";
import { useActionState } from "react";
import { addAvailabilityAction, addTimeOffAction } from "../actions";
import { FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { WEEKDAYS } from "@/lib/domain";

const TIMES: string[] = [];
for (let m = 6 * 60; m <= 24 * 60 - 30; m += 30) TIMES.push(`${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
function label(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "ص" : "م"}`;
}

export function AddRuleForm() {
  const [state, action] = useActionState(addAvailabilityAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <fieldset>
        <legend className="mb-2 font-medium">الأيام</legend>
        <div className="flex flex-wrap gap-2">
          {WEEKDAYS.map((d, i) => (
            <label key={d} className="cursor-pointer rounded-full border-[1.5px] border-line px-3.5 py-1.5 text-[.93rem] has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100">
              <input type="checkbox" name="weekdays" value={i} className="sr-only" />{d}
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="weekdays" />
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <div className="field">
          <label htmlFor="start">من</label>
          <select id="start" name="start" className="input" defaultValue="16:00">
            {TIMES.map((t) => <option key={t} value={t}>{label(t)}</option>)}
          </select>
          <FieldErrorText state={state} name="start" />
        </div>
        <div className="field">
          <label htmlFor="end">إلى</label>
          <select id="end" name="end" className="input" defaultValue="20:00">
            {[...TIMES.slice(2), "24:00"].map((t) => <option key={t} value={t}>{t === "24:00" ? "12:00 منتصف الليل" : label(t)}</option>)}
          </select>
          <FieldErrorText state={state} name="end" />
        </div>
      </div>
      <SubmitButton className="btn btn-primary" pending="جاري الإضافة...">أضيفي الفترة</SubmitButton>
    </form>
  );
}

export function TimeOffForm() {
  const [state, action] = useActionState(addTimeOffAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div className="field"><label htmlFor="from">من تاريخ</label><input id="from" name="from" type="date" className="input" required /></div>
        <div className="field"><label htmlFor="to">إلى تاريخ</label><input id="to" name="to" type="date" className="input" required />
          <FieldErrorText state={state} name="to" /></div>
      </div>
      <div className="field"><label htmlFor="reason">السبب (اختياري)</label><input id="reason" name="reason" className="input" maxLength={200} /></div>
      <SubmitButton className="btn btn-ghost" pending="جاري الحفظ...">سجّلي الإجازة</SubmitButton>
    </form>
  );
}
