import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";
import { safeNext } from "@/lib/validation";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "حساب ولي أمر جديد" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const next = safeNext((await searchParams).next) ?? undefined;
  return (
    <>
      <h1 className="text-3xl">حساب ولي أمر جديد</h1>
      <p className="mb-8 mt-2 text-muted">حساب واحد يكفي لكل أبنائك. تضيفهم بعد التسجيل.</p>
      <RegisterForm next={next} />
      <p className="mt-8 text-[.95rem] text-muted">عندك حساب؟ <Link href="/login" className="font-medium text-lav-700 underline">سجّل الدخول</Link></p>
    </>
  );
}
