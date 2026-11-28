import Link from "next/link";
import { PageTitle } from "@/components/DashShell";
import { needsEmailVerification, requireRole } from "@/lib/auth";
import { VerifyEmailBanner } from "@/components/VerifyEmailBanner";
import { getPlans, planPrice, planSessionsLine } from "@/lib/plans";
import { studentsOf } from "@/lib/queries";
import { SubscribeForm } from "./SubscribeForm";

export const metadata = { title: "اشتراك جديد" };

export default async function SubscribePage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const user = await requireRole("parent");
  if (await needsEmailVerification(user)) {
    return (
      <>
        <PageTitle title="اشتراك جديد" />
        <VerifyEmailBanner email={user.email} blocking="أكّد بريدك قبل الدفع، فبه نربط الدفع باشتراكك ونرسل لك تأكيد التفعيل" />
      </>
    );
  }
  const { plan } = await searchParams;
  const [plans, students] = await Promise.all([getPlans(), studentsOf(user.id)]);

  if (students.length === 0) {
    return (
      <>
        <PageTitle title="اشتراك جديد" />
        <div className="panel p-6">
          <p className="font-medium">أضف الطالب أولاً</p>
          <p className="mt-1 text-muted">نحتاج إلى اسم الطالب وصفه لنربط الاشتراك به ونعرض المعلمات المناسبات.</p>
          <Link href="/parent/students?next=subscribe" className="btn btn-primary mt-4">أضف طالباً</Link>
        </div>
      </>
    );
  }

  return (
    <>
      <PageTitle title="اشتراك جديد" sub="جميع الحصص فردية لابنك. اختر الباقة والطالب والمسار، ثم ادفع عبر سلة." />
      <SubscribeForm
        initialPlan={plan}
        students={students.map(({ id, full_name, grade }) => ({ id, full_name, grade }))}
        plans={plans.map((p) => ({
          code: p.code, name_ar: p.name_ar, price: planPrice(p), all_subjects: p.all_subjects,
          sessions: p.sessions_count, bonus: p.bonus_sessions, hasLink: !!p.salla_url, line: planSessionsLine(p), renewable: p.renewable,
        }))}
      />
    </>
  );
}
