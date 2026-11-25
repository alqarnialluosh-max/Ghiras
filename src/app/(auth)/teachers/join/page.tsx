import Link from "next/link";
import { redirect } from "next/navigation";
import { getSessionUser, homeFor } from "@/lib/auth";
import { site } from "@/config/site";
import { TeacherForm } from "./TeacherForm";

export const metadata = { title: "انضمي لفريق معلمات غِراس" };

export default async function TeacherJoinPage() {
  const user = await getSessionUser();
  if (user) redirect(homeFor(user.role));
  return (
    <>
      <h1 className="text-3xl">انضمي لفريق معلمات غِراس</h1>
      <p className="mb-8 mt-2 text-muted">
        تحددين أوقاتك، وتستلمين أجرك عن كل حصة تقدمينها. كل طلب تراجعه {site.supervisor.name}، وبعد الموافقة تفتح لك صفحتك وتبدأ الحجوزات.
      </p>
      <TeacherForm />
      <p className="mt-8 text-[.95rem] text-muted">قدّمتِ من قبل؟ <Link href="/login" className="font-medium text-lav-700 underline">سجّلي الدخول</Link></p>
    </>
  );
}
