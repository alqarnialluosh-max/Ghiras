"use client";
import { useActionState } from "react";
import { addStudentAction, updateStudentAction } from "../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES } from "@/lib/domain";

export function StudentForm({ student, next }: {
  student?: { id: string; full_name: string; grade: number; notes: string }; next?: string;
}) {
  const [state, action] = useActionState(student ? updateStudentAction : addStudentAction, {});
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {student && <input type="hidden" name="id" value={student.id} />}
      {next && <input type="hidden" name="next" value={next} />}
      <Field name="full_name" label="اسم الطالب" required state={state} defaultValue={student?.full_name} />
      <div className="field">
        <label htmlFor={`grade-${student?.id ?? "new"}`}>الصف الدراسي</label>
        <select id={`grade-${student?.id ?? "new"}`} name="grade" className="input" defaultValue={state.values?.grade ?? String(student?.grade ?? "")}>
          <option value="" disabled>اختر الصف</option>
          {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}
        </select>
        <FieldErrorText state={state} name="grade" />
      </div>
      <div className="field">
        <label htmlFor={`notes-${student?.id ?? "new"}`}>ملاحظات للمعلمة (اختياري)</label>
        <textarea id={`notes-${student?.id ?? "new"}`} name="notes" className="input" maxLength={1000}
          defaultValue={state.values?.notes ?? student?.notes} placeholder="مثلاً: يحتاج إلى تأسيس في جدول الضرب" />
        <p className="hint">تُحفظ مشفّرة، وتظهر فقط لمعلمات الطالب.</p>
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ...">{student ? "حفظ التعديل" : "أضف الطالب"}</SubmitButton>
    </form>
  );
}
