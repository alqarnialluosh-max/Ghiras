"use client";
import { useActionState } from "react";
import { loginAction } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function LoginForm({ next }: { next?: string }) {
  const [state, action] = useActionState(loginAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="next" value={next ?? ""} />
      <Field name="email" label="البريد الإلكتروني" type="email" autoComplete="email" dir="ltr" required state={state} />
      <Field name="password" label="كلمة المرور" type="password" autoComplete="current-password" required state={state} />
      <SubmitButton pending="جاري الدخول...">دخول</SubmitButton>
    </form>
  );
}
