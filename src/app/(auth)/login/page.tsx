import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";
import { safeNext } from "@/lib/validation";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "تسجيل الدخول" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  const next = safeNext((await searchParams).next) ?? undefined;
  return (
    <>
      <h1 className="text-3xl">أهلاً بعودتك</h1>
      <p className="mb-8 mt-2 text-muted">سجّل الدخول إلى حسابك في غِراس، لأولياء الأمور والمعلمات.</p>
      <LoginForm next={next} />
      <div className="mt-8 space-y-2 text-[.95rem] text-muted">
        <p>ليس لديك حساب؟ <Link href={`/register${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="font-medium text-lav-700 underline">أنشئ حساب ولي أمر</Link></p>
        <p>هل أنتِ معلمة؟ <Link href="/teachers/join" className="font-medium text-lav-700 underline">قدّمي طلب انضمام</Link></p>
        <p>نسيت كلمة المرور؟ راسلنا <a href="https://wa.me/966565975402" target="_blank" rel="noopener noreferrer" className="font-medium text-lav-700 underline">واتساب</a> لإعادة تعيينها.</p>
      </div>
    </>
  );
}
