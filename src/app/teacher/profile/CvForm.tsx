"use client";
import { useActionState } from "react";
import { replaceCvAction } from "../actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function CvForm({ hasCv }: { hasCv: boolean }) {
  const [state, action] = useActionState(replaceCvAction, {});
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input name="cv" type="file" required accept=".pdf,.docx,.jpg,.jpeg,.png" aria-label="ملف السيرة الذاتية"
        className="input file:ml-3 file:rounded-full file:border-0 file:bg-lav-100 file:px-4 file:py-1.5 file:text-lav-700" />
      <p className="hint">PDF أو Word أو صورة، حتى 5 ميجابايت.</p>
      <SubmitButton className="btn btn-ghost btn-sm" pending="جاري الرفع...">{hasCv ? "رفع نسخة محدّثة" : "رفع السيرة الذاتية"}</SubmitButton>
    </form>
  );
}
