"use client";
import { useActionState } from "react";
import { updateProfileAction } from "../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES, SUBJECTS } from "@/lib/domain";
import type { TeacherProfile } from "@/lib/teachers";

export function ProfileForm({ p, auto = false }: { p: TeacherProfile; auto?: boolean }) {
  const [state, action] = useActionState(updateProfileAction, {});
  return (
    <form action={action} className="space-y-5">
      <FormMessage state={state} />
      {auto && <p className="alert alert-info">يُنشأ رابط اجتماع خاص لكل حصة تلقائياً. الرابط الدائم أدناه اختياري ويُستخدم احتياطاً فقط.</p>}
      <Field name="teams_link" label={auto ? "رابط اجتماعك الدائم (احتياطي)" : "رابط اجتماعك الدائم"} dir="ltr" state={state} defaultValue={p.teams_link ?? ""}
        placeholder="https://meet.google.com/abc-defg-hij"
        hint="من Google Meet: meet.google.com ← اجتماع جديد ← إنشاء اجتماع لاحقاً ← انسخي الرابط. ويُقبل رابط Teams أيضاً." />
      <fieldset className="field">
        <legend className="mb-2 font-medium">المواد</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(SUBJECTS).map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-2 has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100">
              <input type="checkbox" name="subjects" value={k} defaultChecked={p.subjects.includes(k as never)} className="h-4 w-4 accent-lav-700" />{l}
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="subjects" />
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field"><label htmlFor="min_grade">من صف</label>
          <select id="min_grade" name="min_grade" className="input" defaultValue={p.min_grade}>
            {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}</select></div>
        <div className="field"><label htmlFor="max_grade">إلى صف</label>
          <select id="max_grade" name="max_grade" className="input" defaultValue={p.max_grade}>
            {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}</select>
          <FieldErrorText state={state} name="max_grade" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_.6fr]">
        <Field name="qualification" label="المؤهل" state={state} defaultValue={p.qualification} />
        <Field name="years_experience" label="سنوات الخبرة" type="number" state={state} defaultValue={String(p.years_experience)} />
      </div>
      <div className="field"><label htmlFor="bio">النبذة (تظهر لأولياء الأمور عند اختيار المعلمة)</label>
        <textarea id="bio" name="bio" className="input" defaultValue={p.bio} maxLength={1500} />
        <FieldErrorText state={state} name="bio" /></div>
      <label className="flex items-center gap-3">
        <input type="checkbox" name="accepting" defaultChecked={p.accepting} className="h-4 w-4 accent-lav-700" />
        أستقبل حجوزات جديدة
      </label>
      <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ...">احفظي الملف</SubmitButton>
    </form>
  );
}
