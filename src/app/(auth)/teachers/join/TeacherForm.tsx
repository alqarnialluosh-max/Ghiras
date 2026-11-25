"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerTeacherAction } from "../../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES, SUBJECTS } from "@/lib/domain";

export function TeacherForm() {
  const [state, action] = useActionState(registerTeacherAction, {});
  const v = state.values ?? {};
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field name="full_name" label="الاسم الكامل" autoComplete="name" required state={state} />
      <Field name="email" label="البريد الإلكتروني" type="email" autoComplete="email" dir="ltr" required state={state} />
      <Field name="phone" label="رقم الجوال" type="tel" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" required state={state} />
      <Field name="password" label="كلمة المرور" type="password" autoComplete="new-password" required state={state} hint="10 أحرف على الأقل، حروف وأرقام." />

      <fieldset className="field">
        <legend className="mb-2 font-medium">المواد التي تدرّسينها</legend>
        <div className="flex flex-wrap gap-3">
          {Object.entries(SUBJECTS).map(([k, label]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-2 has-[:checked]:border-lav-400 has-[:checked]:bg-lav-100">
              <input type="checkbox" name="subjects" value={k} defaultChecked={(v.subjects ?? "").split(",").includes(k)} className="h-4 w-4 accent-lav-700" />
              {label}
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="subjects" />
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="min_grade">من صف</label>
          <select id="min_grade" name="min_grade" className="input" defaultValue={v.min_grade ?? "1"}>
            {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="max_grade">إلى صف</label>
          <select id="max_grade" name="max_grade" className="input" defaultValue={v.max_grade ?? "9"}>
            {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}
          </select>
          <FieldErrorText state={state} name="max_grade" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_.6fr]">
        <Field name="qualification" label="المؤهل" placeholder="بكالوريوس رياضيات" required state={state} />
        <Field name="years_experience" label="سنوات الخبرة" type="number" inputMode="numeric" defaultValue="0" required state={state} />
      </div>

      <div className="field">
        <label htmlFor="bio">نبذة عنك وعن طريقة تدريسك</label>
        <textarea id="bio" name="bio" className="input" defaultValue={v.bio} maxLength={1500}
          aria-invalid={state.fieldErrors?.bio ? true : undefined} />
        <FieldErrorText state={state} name="bio" />
      </div>

      <div className="field">
        <label htmlFor="cv">السيرة الذاتية <span className="text-bad">*</span></label>
        <input id="cv" name="cv" type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png"
          className="input file:ml-3 file:rounded-full file:border-0 file:bg-lav-100 file:px-4 file:py-1.5 file:text-lav-700"
          aria-invalid={state.fieldErrors?.cv ? true : undefined} />
        {state.fieldErrors?.cv ? <p className="text-sm text-bad">{state.fieldErrors.cv}</p>
          : <p className="hint">PDF أو Word أو صورة، حتى 5 ميجابايت. تطّلع عليها الإدارة فقط.{state.error ? " (أعيدي إرفاق الملف)" : ""}</p>}
      </div>

      <Field name="teams_link" label="رابط اجتماع Teams الدائم (اختياري الآن)" dir="ltr" state={state}
        placeholder="https://teams.microsoft.com/l/meetup-join/..."
        hint="يظهر هذا الرابط للطالب في جميع حصصك، ويمكنك إضافته لاحقاً من صفحتك." />

      <div>
        <label className="flex items-start gap-3 text-[.95rem]">
          <input type="checkbox" name="consent" defaultChecked={v.consent === "on"} className="mt-1.5 h-4 w-4 accent-lav-700" />
          <span>أوافق على <Link href="/terms#teachers" className="text-lav-700 underline" target="_blank">شروط عمل المعلمات</Link> و<Link href="/privacy" className="text-lav-700 underline" target="_blank">سياسة الخصوصية</Link>.</span>
        </label>
        <FieldErrorText state={state} name="consent" />
      </div>
      <SubmitButton className="btn btn-sky w-full" pending="جارٍ الإرسال...">أرسلي طلب الانضمام</SubmitButton>
    </form>
  );
}
