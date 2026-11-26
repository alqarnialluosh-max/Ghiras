import Link from "next/link";
import { audit } from "@/lib/audit";
import { getSessionUser, homeFor } from "@/lib/auth";
import { tx } from "@/lib/db";
import { consumeToken } from "@/lib/email";

export const metadata = { title: "تأكيد البريد", referrer: "no-referrer" };
export const dynamic = "force-dynamic";

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const userId = await tx(async (c) => {
    const t = await consumeToken(c, "verify", token);
    if (!t) return null;
    await c.query(`UPDATE users SET email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [t.user_id]);
    await audit("auth.email_verified", "user", t.user_id, t.user_id, {}, c);
    return t.user_id;
  });
  const user = await getSessionUser();
  const home = user ? homeFor(user.role) : "/login";
  return userId ? (
    <>
      <h1 className="text-3xl">تم تأكيد بريدك</h1>
      <p className="mt-3 text-muted">شكراً لك. ستصلك مواعيد الحصص وتقاريرها على هذا البريد.</p>
      <Link href={home} className="btn btn-primary mt-8 w-fit">{user ? "المتابعة إلى حسابي" : "تسجيل الدخول"}</Link>
    </>
  ) : (
    <>
      <h1 className="text-3xl">الرابط غير صالح</h1>
      <p className="mt-3 text-muted">ربما استُخدم الرابط من قبل أو انتهت صلاحيته (48 ساعة). يمكنك طلب رابط جديد من حسابك.</p>
      <Link href={home} className="btn btn-primary mt-8 w-fit">{user ? "حسابي" : "تسجيل الدخول"}</Link>
    </>
  );
}
