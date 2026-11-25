"use client";
import { useActionState } from "react";
import { updateSessionAction } from "../../actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function SessionReportForm({ id, status, notes }: { id: string; status: string; notes: string }) {
  const [state, action] = useActionState(updateSessionAction, {});
  return (
    <form action={action} className="mt-4 space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <fieldset className="flex flex-wrap gap-3">
        <legend className="sr-only">الحضور</legend>
        {[["completed", "تمت الحصة"], ["student_absent", "تغيّب الطالب"]].map(([v, l]) => (
          <label key={v} className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-2 has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100">
            <input type="radio" name="status" value={v} defaultChecked={status === v || (status === "scheduled" && v === "completed")} className="accent-lav-700" />
            {l}
          </label>
        ))}
      </fieldset>
      <div className="field">
        <label htmlFor="teacher_notes">ملاحظات لولي الأمر (اختياري)</label>
        <textarea id="teacher_notes" name="teacher_notes" className="input" defaultValue={notes} maxLength={2000}
          placeholder="ما الذي تم شرحه اليوم، ومستوى الطالب، وما يحتاج إلى مراجعته قبل الحصة القادمة" />
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ...">احفظي</SubmitButton>
    </form>
  );
}
