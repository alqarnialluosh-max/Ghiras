import { ActionForm } from "@/components/ActionForm";
import { Empty, PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { decrypt } from "@/lib/crypto";
import { q } from "@/lib/db";
import { GRADES } from "@/lib/domain";
import { displayPhone } from "@/lib/phone";
import { shortDate } from "@/lib/time";
import { getPlans } from "@/lib/plans";
import { SUBJECTS, TRACKS } from "@/lib/domain";
import { addManualSubscriptionAction, resetPasswordAction } from "../actions";

export const metadata = { title: "أولياء الأمور" };

export default async function AdminParents({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const term = ((await searchParams).q ?? "").trim().slice(0, 80);
  const rows = await q<{ id: string; full_name: string; email: string; phone_enc: string | null; created_at: Date;
    last_login_at: Date | null; students: { id: string; name: string; grade: number }[] | null; active_subs: string }>(`
    SELECT u.id, u.full_name, u.email, u.phone_enc, u.created_at, u.last_login_at,
           (SELECT json_agg(json_build_object('id', s.id, 'name', s.full_name, 'grade', s.grade)) FROM students s WHERE s.parent_id = u.id) students,
           (SELECT count(*) FROM subscriptions s WHERE s.parent_id = u.id AND s.status = 'active') active_subs
      FROM users u WHERE u.role = 'parent' ${term ? "AND (u.full_name ILIKE $1 OR u.email ILIKE $1)" : ""}
      ORDER BY u.created_at DESC LIMIT 200`, term ? [`%${term}%`] : []);
  const plans = await getPlans(true);
  return (
    <>
      <PageTitle title="أولياء الأمور" sub="الجوالات تُفك من التشفير هنا فقط للمالك."
        action={<a href="/admin/clients/new" className="btn btn-primary btn-sm">إنشاء حساب عميل</a>} />
      <form className="mb-6"><input name="q" defaultValue={term} placeholder="بحث بالاسم أو البريد" className="input max-w-sm" /></form>
      {rows.length === 0 ? <Empty title="ما فيه نتائج" /> : (
        <div className="space-y-3">
          {rows.map((r) => (
            <details key={r.id} className="panel p-5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
                <span><span className="font-semibold">{r.full_name}</span> <span className="text-[.95rem] text-muted" dir="ltr">{r.email}</span></span>
                <span className="text-sm text-muted">{Number(r.active_subs) > 0 ? `${r.active_subs} اشتراك فعّال` : "بدون اشتراك فعّال"}</span>
              </summary>
              <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                <div className="space-y-1 text-[.95rem]">
                  <p><span className="text-muted">الجوال:</span> <span dir="ltr">{displayPhone(decrypt(r.phone_enc)) || "—"}</span></p>
                  <p><span className="text-muted">الأبناء:</span> {(r.students ?? []).map((s) => `${s.name} (${GRADES[s.grade]})`).join("، ") || "—"}</p>
                  <p><span className="text-muted">سجّل:</span> {shortDate(r.created_at)} · <span className="text-muted">آخر دخول:</span> {r.last_login_at ? shortDate(r.last_login_at) : "—"}</p>
                </div>
                <div className="space-y-4">
                  <ActionForm action={resetPasswordAction}>
                    <input type="hidden" name="id" value={r.id} />
                    <SubmitButton className="btn btn-ghost btn-sm">إنشاء كلمة مرور مؤقتة</SubmitButton>
                  </ActionForm>
                  {(r.students ?? []).length > 0 && (
                    <details className="rounded-xl bg-wash p-4">
                      <summary className="cursor-pointer text-[.95rem] font-medium text-lav-700">إضافة اشتراك مفعّل يدوياً</summary>
                      <ActionForm action={addManualSubscriptionAction} className="mt-3 grid gap-2">
                        <select name="student_id" className="input" required>
                          {(r.students ?? []).map((s) => <option key={s.id} value={s.id}>{s.name} — {GRADES[s.grade]}</option>)}
                        </select>
                        <select name="plan" className="input" required defaultValue="">
                          <option value="" disabled>الباقة</option>
                          {plans.map((p) => <option key={p.code} value={p.code}>{p.name_ar} — {Number(p.price_sar)} ﷼</option>)}
                        </select>
                        <div className="grid grid-cols-2 gap-2">
                          <select name="subject" className="input" defaultValue="">
                            <option value="">المادة (لباقة المادة الواحدة/الحصة)</option>
                            {Object.entries(SUBJECTS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                          </select>
                          <select name="track" className="input" defaultValue="followup">
                            {Object.entries(TRACKS).map(([k, t]) => <option key={k} value={k}>{t.name}</option>)}
                          </select>
                        </div>
                        <input name="salla_order_id" className="input" placeholder="رقم طلب سلة (إن وُجد)" dir="ltr" />
                        <input name="payment_note" className="input" placeholder="ملاحظة الدفع، مثلاً: تحويل بنكي" />
                        <SubmitButton className="btn btn-primary btn-sm">تفعيل الاشتراك</SubmitButton>
                      </ActionForm>
                    </details>
                  )}
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
