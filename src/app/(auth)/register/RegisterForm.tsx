"use client";
import Link from "next/link";
import { useActionState } from "react";
import { registerParentAction } from "../actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";

export function RegisterForm({ next }: { next?: string }) {
  const [state, action] = useActionState(registerParentAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="full_name" label="اسم ولي الأمر" autoComplete="name" required state={state} />
      <Field name="email" label="البريد الإلكتروني" type="email" autoComplete="email" dir="ltr" required state={state}
        hint="استخدم نفس البريد عند الدفع في سلة حتى يتفعل اشتراكك تلقائياً." />
      <Field name="phone" label="رقم الجوال" type="tel" autoComplete="tel" inputMode="tel" dir="ltr" placeholder="05XXXXXXXX" required state={state} />
      <Field name="password" label="كلمة المرور" type="password" autoComplete="new-password" required state={state}
        hint="10 أحرف على الأقل، حروف وأرقام." />
      <div>
        <label className="flex items-start gap-3 text-[.95rem]">
          <input type="checkbox" name="consent" defaultChecked={state.values?.consent === "on"} className="mt-1.5 h-4 w-4 accent-lav-700" />
          <span>أوافق على <Link href="/privacy" className="text-lav-700 underline" target="_blank">سياسة الخصوصية</Link> و<Link href="/terms" className="text-lav-700 underline" target="_blank">الشروط</Link>.</span>
        </label>
        <FieldErrorText state={state} name="consent" />
      </div>
      <SubmitButton pending="جاري إنشاء الحساب...">إنشاء الحساب</SubmitButton>
    </form>
  );
}
