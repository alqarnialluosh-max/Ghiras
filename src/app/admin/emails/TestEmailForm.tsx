"use client";
import { useActionState } from "react";
import { sendTestEmailAction } from "../actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function TestEmailForm({ defaultTo }: { defaultTo: string }) {
  const [state, action] = useActionState(sendTestEmailAction, {});
  return (
    <form action={action} className="mt-4 flex flex-wrap items-end gap-3">
      <div className="field min-w-[260px] flex-1">
        <label htmlFor="to">أرسل رسالة تجريبية إلى</label>
        <input id="to" name="to" type="email" dir="ltr" className="input" defaultValue={defaultTo} required />
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الإرسال...">أرسل</SubmitButton>
      <div className="w-full"><FormMessage state={state} /></div>
    </form>
  );
}
