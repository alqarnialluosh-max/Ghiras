"use client";
import { useActionState } from "react";
import { forgotPasswordAction } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function ForgotForm() {
  const [state, action] = useActionState(forgotPasswordAction, {});
  if (state.ok) return <p role="status" className="alert alert-ok">{state.ok}</p>;
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field name="email" label="البريد الإلكتروني" type="email" autoComplete="email" dir="ltr" required state={state} />
      <SubmitButton pending="جارٍ الإرسال...">أرسل الرابط</SubmitButton>
    </form>
  );
}
