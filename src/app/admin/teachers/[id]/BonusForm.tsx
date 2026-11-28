"use client";
import { useActionState } from "react";
import { addBonusAction } from "../../actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function BonusForm({ teacherId, month }: { teacherId: string; month: string }) {
  const [state, action] = useActionState(addBonusAction, {});
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="teacher_id" value={teacherId} />
      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_2fr]">
        <div className="field"><label htmlFor="b-amount">المبلغ (ريال)</label>
          <input id="b-amount" name="amount_sar" type="number" min={1} step="1" className="input" defaultValue={state.values?.amount_sar} required /></div>
        <div className="field"><label htmlFor="b-month">يُصرف مع شهر</label>
          <input id="b-month" name="month" type="month" dir="ltr" className="input" defaultValue={state.values?.month ?? month} required /></div>
        <div className="field"><label htmlFor="b-reason">السبب</label>
          <input id="b-reason" name="reason" className="input" maxLength={500} defaultValue={state.values?.reason} placeholder="مثال: تقييمات ممتازة من الأسر هذا الشهر" required /></div>
      </div>
      <SubmitButton className="btn btn-primary btn-sm" pending="جارٍ الإضافة...">إضافة المكافأة</SubmitButton>
    </form>
  );
}
