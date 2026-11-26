"use client";
import { useActionState, useState } from "react";
import { updateSessionAction } from "../../actions";
import { FormMessage, SubmitButton } from "@/components/forms";
import { REPORT_FIELDS, UNDERSTANDING, type SessionReport } from "@/lib/report";

const chip = "flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-2 has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100";

export function SessionReportForm({ id, status, notes, report }: { id: string; status: string; notes: string; report: SessionReport }) {
  const [state, action] = useActionState(updateSessionAction, {});
  const [picked, setPicked] = useState(status === "student_absent" ? "student_absent" : "completed");
  const v = (k: string) => (state.values?.[k] as string | undefined) ?? (report as Record<string, string | undefined>)[k] ?? "";

  return (
    <form action={action} className="mt-4 space-y-5">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">الحضور</legend>
        {[["completed", "تمت الحصة"], ["student_absent", "تغيّب الطالب"]].map(([val, l]) => (
          <label key={val} className={chip}>
            <input type="radio" name="status" value={val} checked={picked === val} onChange={() => setPicked(val)} className="accent-lav-700" />
            {l}
          </label>
        ))}
      </fieldset>

      {picked === "completed" && (
        <div className="space-y-5 rounded-2xl bg-wash p-5">
          <div>
            <p className="font-semibold">تقرير الحصة لولي الأمر</p>
            <p className="text-sm text-muted">اختياري، لكنه أكثر ما يقدّره الأهل. اكتبي ما يناسب، والحقول الفارغة لا تظهر.</p>
          </div>
          <fieldset>
            <legend className="mb-2 text-[.95rem] font-medium">مستوى الاستيعاب</legend>
            <div className="flex flex-wrap gap-2">
              {Object.entries(UNDERSTANDING).map(([val, l]) => (
                <label key={val} className={`${chip} bg-white text-[.95rem]`}>
                  <input type="radio" name="understanding" value={val} defaultChecked={v("understanding") === val} className="accent-lav-700" />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 md:grid-cols-2">
            {REPORT_FIELDS.map((f) => (
              <div key={f.key} className={`field ${f.key === "covered" ? "md:col-span-2" : ""}`}>
                <label htmlFor={`r-${f.key}`}>{f.label}</label>
                <textarea id={`r-${f.key}`} name={f.key} rows={2} maxLength={600} className="input bg-white"
                  defaultValue={v(f.key)} placeholder={f.placeholder} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="field">
        <label htmlFor="teacher_notes">{picked === "completed" ? "ملاحظة إضافية (اختياري)" : "ملاحظة لولي الأمر (اختياري)"}</label>
        <textarea id="teacher_notes" name="teacher_notes" className="input" rows={2} defaultValue={notes} maxLength={2000} />
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ...">احفظي</SubmitButton>
    </form>
  );
}
