"use client";
import { useActionState } from "react";
import { resetPasswordAction } from "../actions";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function ResetForm({ token }: { token: string }) {
  const [state, action] = useActionState(resetPasswordAction, {});
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <input type="hidden" name="token" value={token} />
      <Field name="password" label="كلمة المرور الجديدة" type="password" autoComplete="new-password" required state={state}
        hint="10 أحرف على الأقل، حروف وأرقام معاً" />
      <Field name="password2" label="أعد كتابتها" type="password" autoComplete="new-password" required state={state} />
      <SubmitButton pending="جارٍ الحفظ...">احفظ كلمة المرور</SubmitButton>
    </form>
  );
}
