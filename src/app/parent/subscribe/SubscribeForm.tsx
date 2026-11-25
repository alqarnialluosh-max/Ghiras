"use client";
import { useActionState, useState } from "react";
import { subscribeAction } from "../actions";
import { FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES, SUBJECTS, TRACKS } from "@/lib/domain";

type P = { code: string; name_ar: string; price: string; all_subjects: boolean; sessions: number; bonus: number; hasLink: boolean };

export function SubscribeForm({ plans, students, initialPlan }: {
  plans: P[]; students: { id: string; full_name: string; grade: number }[]; initialPlan?: string;
}) {
  const [state, action] = useActionState(subscribeAction, {});
  const [plan, setPlan] = useState(state.values?.plan ?? initialPlan ?? plans[0]?.code);
  const current = plans.find((p) => p.code === plan);

  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />

      <fieldset>
        <legend className="mb-3 text-lg font-semibold">الباقة</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {plans.map((p) => (
            <label key={p.code} className="panel cursor-pointer p-5 has-[:checked]:border-lav-600 has-[:checked]:bg-lav-100/60 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
              <input type="radio" name="plan" value={p.code} className="sr-only" checked={plan === p.code} onChange={() => setPlan(p.code)} />
              <span className="block font-semibold">{p.name_ar}</span>
              <span className="mt-1 block text-[.92rem] text-muted">
                {p.sessions + p.bonus} {p.sessions + p.bonus === 1 ? "حصة" : "حصص"}{p.bonus > 0 ? " (الأولى مجاناً)" : ""}
              </span>
              <span className="mt-3 block"><span className="font-display text-3xl text-lav-700">{p.price}</span> ريال</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="field">
          <label htmlFor="student_id" className="text-lg font-semibold">الطالب</label>
          <select id="student_id" name="student_id" className="input" defaultValue={state.values?.student_id ?? students[0]?.id}>
            {students.map((s) => <option key={s.id} value={s.id}>{s.full_name} — {GRADES[s.grade]}</option>)}
          </select>
          <FieldErrorText state={state} name="student_id" />
        </div>
        {current && !current.all_subjects && (
          <div className="field">
            <label htmlFor="subject" className="text-lg font-semibold">المادة</label>
            <select id="subject" name="subject" className="input" defaultValue={state.values?.subject ?? ""}>
              <option value="" disabled>اختر المادة</option>
              {Object.entries(SUBJECTS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <FieldErrorText state={state} name="subject" />
          </div>
        )}
      </div>

      <fieldset>
        <legend className="mb-3 text-lg font-semibold">المسار</legend>
        <div className="grid gap-3 md:grid-cols-3">
          {Object.entries(TRACKS).map(([k, t]) => (
            <label key={k} className="panel cursor-pointer p-4 has-[:checked]:border-sky-500 has-[:checked]:bg-sky-50 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-sky-500">
              <input type="radio" name="track" value={k} className="sr-only" defaultChecked={(state.values?.track ?? "followup") === k} />
              <span className="block font-semibold">{t.name}</span>
              <span className="mt-1 block text-[.9rem] text-muted">{t.desc}</span>
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="track" />
      </fieldset>

      <div className="rounded-2xl bg-wash p-5 text-[.95rem]">
        بعد الضغط بننقلك لمتجر غِراس في <strong>سلة</strong> لإتمام الدفع. استخدم نفس <strong>البريد أو رقم الجوال</strong> المسجل في حسابك، ويتفعل الاشتراك تلقائياً.
      </div>
      <SubmitButton className="btn btn-primary w-full sm:w-auto" pending="جاري التحويل..." disabled={current && !current.hasLink}>
        {current?.hasLink === false ? "رابط الدفع لهذه الباقة غير جاهز بعد" : `انتقل للدفع${current ? ` — ${current.price} ريال` : ""}`}
      </SubmitButton>
    </form>
  );
}
