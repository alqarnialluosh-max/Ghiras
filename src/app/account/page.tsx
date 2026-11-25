import { ActionForm } from "@/components/ActionForm";
import { DashShell, PageTitle } from "@/components/DashShell";
import { Field, SubmitButton } from "@/components/forms";
import { getSessionUser, homeFor } from "@/lib/auth";
import { redirect } from "next/navigation";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "حسابي" };

export default async function AccountPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?next=/account");
  return (
    <DashShell user={user} nav={[{ href: homeFor(user.role), label: "رجوع للوحتي" }, { href: "/account", label: "حسابي" }]}>
      <PageTitle title="حسابي" sub={<span dir="ltr">{user.email}</span>} />
      <section className="panel max-w-lg p-6">
        <h2 className="mb-4 text-xl">تغيير كلمة المرور</h2>
        <ActionForm action={changePasswordAction} className="space-y-4">
          <Field name="current" label="كلمة المرور الحالية" type="password" autoComplete="current-password" required />
          <Field name="password" label="كلمة المرور الجديدة" type="password" autoComplete="new-password" required hint="10 أحرف على الأقل، حروف وأرقام." />
          <SubmitButton className="btn btn-primary" pending="جاري الحفظ...">احفظ كلمة المرور</SubmitButton>
        </ActionForm>
        <p className="mt-4 text-sm text-muted">بعد التغيير يتم تسجيل خروجك من الأجهزة الأخرى.</p>
      </section>
    </DashShell>
  );
}
