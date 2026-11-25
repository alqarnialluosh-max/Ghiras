import Link from "next/link";
import { getSessionUser, homeFor } from "@/lib/auth";
import { Logo } from "./Logo";

export async function SiteHeader() {
  const user = await getSessionUser().catch(() => null);
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-white/90 backdrop-blur">
      <div className="wrap flex h-[72px] items-center justify-between gap-4">
        <Logo />
        <nav aria-label="التنقل الرئيسي" className="hidden items-center gap-7 text-[.97rem] md:flex">
          <a href="/#tracks" className="hover:text-lav-700">المسارات</a>
          <a href="/#how" className="hover:text-lav-700">طريقة الحجز</a>
          <a href="/#pricing" className="hover:text-lav-700">الباقات</a>
          <a href="/#faq" className="hover:text-lav-700">الأسئلة الشائعة</a>
          <Link href="/teachers/join" className="hover:text-lav-700">انضمي كمعلمة</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <Link href={homeFor(user.role)} className="btn btn-primary btn-sm">لوحتي</Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-ghost btn-sm">دخول</Link>
              <Link href="/register" className="btn btn-primary btn-sm hidden sm:inline-flex">حساب جديد</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
