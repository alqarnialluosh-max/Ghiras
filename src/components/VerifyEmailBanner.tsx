"use client";
import { useActionState } from "react";
import { resendVerificationAction } from "@/app/(auth)/actions";

/** Shown until the address is confirmed. `blocking` explains that this page needs it. */
export function VerifyEmailBanner({ email, blocking }: { email: string; blocking?: string }) {
  const [state, action, pending] = useActionState(resendVerificationAction, {});
  return (
    <section role="region" aria-label="تأكيد البريد" className="panel mb-6 border-amber-200 bg-amber-50 p-5">
      <p className="font-medium text-amber-900">{blocking ?? "أكّد بريدك الإلكتروني"}</p>
      <p className="mt-1 text-[.95rem] text-amber-900/80">
        أرسلنا رابط التأكيد إلى <span dir="ltr" className="font-medium">{email}</span>. افتح الرسالة واضغط «تأكيد البريد»، وتحقق من الرسائل غير المرغوب فيها إن لم تجدها.
      </p>
      <form action={action} className="mt-3 flex flex-wrap items-center gap-3">
        <button className="btn btn-ghost btn-sm bg-white" disabled={pending}>{pending ? "جارٍ الإرسال..." : "أرسل الرابط مرة أخرى"}</button>
        {state.ok && <span role="status" className="text-sm text-emerald-800">{state.ok}</span>}
        {state.error && <span role="alert" className="text-sm text-red-800">{state.error}</span>}
      </form>
    </section>
  );
}
