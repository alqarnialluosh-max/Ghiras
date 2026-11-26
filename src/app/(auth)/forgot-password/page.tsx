import Link from "next/link";
import { ForgotForm } from "./ForgotForm";

export const metadata = { title: "نسيت كلمة المرور" };

export default function ForgotPage() {
  return (
    <>
      <h1 className="text-3xl">نسيت كلمة المرور؟</h1>
      <p className="mb-8 mt-2 text-muted">اكتب بريدك المسجل في غِراس، ونرسل لك رابطاً لاختيار كلمة مرور جديدة.</p>
      <ForgotForm />
      <p className="mt-8 text-[.95rem] text-muted"><Link href="/login" className="font-medium text-lav-700 underline">العودة لتسجيل الدخول</Link></p>
    </>
  );
}
