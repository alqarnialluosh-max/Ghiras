import { requirePerm } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { getPlans } from "@/lib/plans";
import { updatePlanAction } from "../actions";

export const metadata = { title: "الأسعار والباقات" };

export default async function AdminPlans() {
  await requirePerm("settings.manage");
  const plans = await getPlans(true);
  return (
    <>
      <PageTitle title="الأسعار والباقات" sub="سعر كل منتج للعميل، وأجر المعلمة عن الحصة الواحدة منه، ورابطه في سلة. التعديل لا يغيّر ما سبق: الاشتراكات المدفوعة بسعرها، والحصص المؤكدة بأجرها." />
      <div className="grid gap-5 lg:grid-cols-3">
        {plans.map((p) => (
          <section key={p.code} className="panel p-6">
            <h2 className="text-xl">{p.name_ar}</h2>
            <p className="mb-4 text-sm text-muted">
              {p.sessions_count + p.bonus_sessions === 1 ? "حصة واحدة" : `${p.sessions_count + p.bonus_sessions} حصص`} · {p.duration_days} يوماً{p.weekly_limit ? ` · ${p.weekly_limit} بالأسبوع` : ""} · الرمز <span dir="ltr">{p.code}</span>
            </p>
            <ActionForm action={updatePlanAction} className="space-y-3">
              <input type="hidden" name="code" value={p.code} />
              <div className="grid grid-cols-2 gap-3">
                <div className="field"><label htmlFor={`price-${p.code}`}>سعر العميل (ريال)</label>
                  <input id={`price-${p.code}`} name="price_sar" type="number" min={0} step="1" defaultValue={Number(p.price_sar)} className="input" /></div>
                <div className="field"><label htmlFor={`rate-${p.code}`}>أجر المعلمة / حصة</label>
                  <input id={`rate-${p.code}`} name="teacher_rate_sar" type="number" min={0} step="0.5" defaultValue={Number(p.teacher_rate_sar)} className="input" /></div>
              </div>
              <p className="rounded-lg bg-wash p-2.5 text-sm text-muted">
                العميل يدفع عن الحصة {(Number(p.price_sar) / Math.max(1, p.sessions_count + p.bonus_sessions)).toFixed(1)} ﷼ ·
                المعلمة {Number(p.teacher_rate_sar)} ﷼ · الهامش {(Number(p.price_sar) / Math.max(1, p.sessions_count + p.bonus_sessions) - Number(p.teacher_rate_sar)).toFixed(1)} ﷼
              </p>
              <div className="field"><label htmlFor={`url-${p.code}`}>رابط المنتج في سلة</label>
                <input id={`url-${p.code}`} name="salla_url" dir="ltr" defaultValue={p.salla_url ?? ""} placeholder="https://your-store.com/..." className="input" /></div>
              <div className="field"><label htmlFor={`pid-${p.code}`}>رقم المنتج في سلة</label>
                <input id={`pid-${p.code}`} name="salla_product_id" dir="ltr" defaultValue={p.salla_product_id ?? ""} className="input" />
                <p className="hint">أو اجعل SKU المنتج في سلة = <span dir="ltr">{p.code}</span></p></div>
              <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={p.active} className="accent-lav-700" /> الباقة ظاهرة للعملاء</label>
              <SubmitButton className="btn btn-primary btn-sm">حفظ</SubmitButton>
            </ActionForm>
          </section>
        ))}
      </div>
    </>
  );
}
