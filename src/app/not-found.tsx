import Link from "next/link";
import { SproutMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-4 px-5 text-center">
      <SproutMark size={56} />
      <h1 className="text-3xl">الصفحة غير موجودة</h1>
      <p className="text-muted">الرابط غير صحيح، أو ليست لديك صلاحية لعرض هذه الصفحة.</p>
      <Link href="/" className="btn btn-primary">الصفحة الرئيسية</Link>
    </main>
  );
}
