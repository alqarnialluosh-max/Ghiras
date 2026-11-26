import Link from "next/link";
import { peekToken } from "@/lib/email";
import { ResetForm } from "./ResetForm";

export const metadata = { title: "كلمة مرور جديدة", referrer: "no-referrer" };

export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const valid = await peekToken("reset", token);
  if (!valid) {
    return (
      <>
        <h1 className="text-3xl">الرابط غير صالح</h1>
        <p className="mt-3 text-muted">انتهت صلاحية الرابط أو استُخدم من قبل. روابط استعادة كلمة المرور صالحة لساعة واحدة ولمرة واحدة.</p>
        <Link href="/forgot-password" className="btn btn-primary mt-8 w-fit">اطلب رابطاً جديداً</Link>
      </>
    );
  }
  return (
    <>
      <h1 className="text-3xl">اختر كلمة مرور جديدة</h1>
      <p className="mb-8 mt-2 text-muted">بعد الحفظ نسجّل خروجك من جميع الأجهزة، ثم تدخل بكلمة المرور الجديدة.</p>
      <ResetForm token={token} />
    </>
  );
}
