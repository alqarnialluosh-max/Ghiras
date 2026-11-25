import { PageTitle } from "@/components/DashShell";
import { getPlans, planPrice } from "@/lib/plans";
import { CreateClientForm } from "./CreateClientForm";

export const metadata = { title: "إنشاء حساب عميل" };

export default async function NewClientPage() {
  const plans = await getPlans(true);
  return (
    <>
      <PageTitle title="إنشاء حساب عميل"
        sub="للحالات الخاصة: عميل سجّل عن طريق الواتساب أو الجوال، دفع بتحويل بنكي، أو ما قدر يسجل بنفسه." />
      <div className="max-w-4xl">
        <CreateClientForm plans={plans.map((p) => ({ code: p.code, name: p.name_ar, price: planPrice(p), all_subjects: p.all_subjects }))} />
      </div>
    </>
  );
}
