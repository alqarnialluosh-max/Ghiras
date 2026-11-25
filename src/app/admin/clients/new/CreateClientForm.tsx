"use client";
import { useActionState, useState } from "react";
import { createClientAction } from "../../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { GRADES, SUBJECTS, TRACKS } from "@/lib/domain";

type P = { code: string; name: string; price: string; all_subjects: boolean };

export function CreateClientForm({ plans }: { plans: P[] }) {
  const [state, action] = useActionState(createClientAction, {});
  const v = state.values ?? {};
  const [plan, setPlan] = useState(v.plan ?? "");
  const current = plans.find((p) => p.code === plan);

  return (
    <form action={action} className="space-y-8" noValidate>
      <FormMessage state={state} />

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg">ولي الأمر</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Field name="full_name" label="الاسم" required state={state} />
          <Field name="email" label="البريد الإلكتروني" type="email" dir="ltr" required state={state} hint="يدخل فيه العميل، ولازم يكون نفس بريد الدفع في سلة." />
          <Field name="phone" label="الجوال" type="tel" dir="ltr" placeholder="05XXXXXXXX" required state={state} />
        </div>
        <p className="text-sm text-muted">تنشأ كلمة مرور مؤقتة تلقائياً وتظهر لك مرة وحدة بعد الحفظ.</p>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg">الطالب</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <Field name="student_name" label="اسم الطالب" required state={state} />
          <div className="field">
            <label htmlFor="grade">الصف</label>
            <select id="grade" name="grade" className="input" defaultValue={v.grade ?? ""}>
              <option value="" disabled>اختر الصف</option>
              {Object.entries(GRADES).map(([g, n]) => <option key={g} value={g}>{n}</option>)}
            </select>
            <FieldErrorText state={state} name="grade" />
          </div>
        </div>
        <div className="field">
          <label htmlFor="notes">ملاحظات للمعلمة (اختياري)</label>
          <textarea id="notes" name="notes" className="input" defaultValue={v.notes} maxLength={1000} />
        </div>
      </section>

      <section className="panel space-y-4 p-6">
        <h2 className="text-lg">الاشتراك (اختياري)</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="field">
            <label htmlFor="plan">الباقة</label>
            <select id="plan" name="plan" className="input" value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">بدون اشتراك الآن</option>
              {plans.map((p) => <option key={p.code} value={p.code}>{p.name} — {p.price} ﷼</option>)}
            </select>
          </div>
          {current && !current.all_subjects && (
            <div className="field">
              <label htmlFor="subject">المادة</label>
              <select id="subject" name="subject" className="input" defaultValue={v.subject ?? ""}>
                <option value="" disabled>اختر المادة</option>
                {Object.entries(SUBJECTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <FieldErrorText state={state} name="subject" />
            </div>
          )}
          {current && (
            <div className="field">
              <label htmlFor="track">المسار</label>
              <select id="track" name="track" className="input" defaultValue={v.track ?? "followup"}>
                {Object.entries(TRACKS).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
              </select>
            </div>
          )}
        </div>
        {current && (
          <div className="grid gap-4 md:grid-cols-2">
            <Field name="salla_order_id" label="رقم طلب سلة (إن وُجد)" dir="ltr" state={state} />
            <Field name="payment_note" label="ملاحظة الدفع" placeholder="مثلاً: تحويل بنكي — الراجحي 25 نوفمبر" state={state} />
          </div>
        )}
        {current && <p className="alert alert-info">الاشتراك يتفعل فوراً ويبدأ عدّ المدة من الآن، ويتسجل باسمك في سجل العمليات.</p>}
      </section>

      <SubmitButton className="btn btn-primary" pending="جاري الإنشاء...">إنشاء الحساب</SubmitButton>
    </form>
  );
}
