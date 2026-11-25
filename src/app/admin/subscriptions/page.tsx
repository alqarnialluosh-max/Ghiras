import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { Empty, PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { q } from "@/lib/db";
import { SUB_STATUS, SUBJECTS, TRACKS, type Subject, type Track } from "@/lib/domain";
import { expireOverdue } from "@/lib/subscriptions";
import { shortDate } from "@/lib/time";
import { activateSubscriptionAction, voidSubscriptionAction } from "../actions";

export const metadata = { title: "الاشتراكات" };

const FILTERS = [["", "الكل"], ["pending_payment", "بانتظار الدفع"], ["active", "فعّالة"], ["expired", "منتهية"]];

export default async function AdminSubscriptions({ searchParams }: { searchParams: Promise<{ status?: string; q?: string }> }) {
  await expireOverdue();
  const sp = await searchParams;
  const status = FILTERS.some(([k]) => k === sp.status) ? sp.status : "";
  const term = (sp.q ?? "").trim().slice(0, 80);
  const params: unknown[] = [];
  const where: string[] = [];
  if (status) { params.push(status); where.push(`s.status = $${params.length}::sub_status`); }
  if (term) { params.push(`%${term}%`); where.push(`(s.reference ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.full_name ILIKE $${params.length} OR st.full_name ILIKE $${params.length})`); }
  const subs = await q<{
    id: string; reference: string; status: string; plan_name: string; subject: Subject | null; track: Track; price_sar: string;
    sessions_total: number; used: string; starts_at: Date | null; ends_at: Date | null; created_at: Date; salla_order_id: string | null;
    parent_name: string; email: string; student_name: string; activation_note: string | null;
  }>(`
    SELECT s.id, s.reference, s.status, p.name_ar plan_name, s.subject, s.track, s.price_sar, s.sessions_total,
           (SELECT count(*) FROM bookings b WHERE b.subscription_id = s.id AND b.status IN ('scheduled','completed','student_absent')) used,
           s.starts_at, s.ends_at, s.created_at, s.salla_order_id, s.activation_note,
           u.full_name parent_name, u.email, st.full_name student_name
      FROM subscriptions s JOIN plans p ON p.code = s.plan_code JOIN users u ON u.id = s.parent_id JOIN students st ON st.id = s.student_id
      ${where.length ? "WHERE " + where.join(" AND ") : ""}
      ORDER BY s.created_at DESC LIMIT 200`, params);

  return (
    <>
      <PageTitle title="الاشتراكات" sub="الاشتراكات المدفوعة ما تنلغي. الطلبات غير المدفوعة فقط يمكن إبطالها." />
      <form className="mb-6 flex flex-wrap items-center gap-2">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/subscriptions${k ? `?status=${k}` : ""}`}
            className={`rounded-full px-4 py-1.5 text-[.93rem] ${status === k ? "bg-lav-700 text-white" : "bg-white text-muted ring-1 ring-line"}`}>{l}</Link>
        ))}
        <input name="q" defaultValue={term} placeholder="بحث: رقم الطلب، البريد، الاسم" className="input mr-auto max-w-xs" />
        {status && <input type="hidden" name="status" value={status} />}
      </form>
      {subs.length === 0 ? <Empty title="ما فيه اشتراكات بهذا الفلتر" /> : (
        <div className="space-y-3">
          {subs.map((s) => (
            <details key={s.id} className="panel p-5">
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <span>
                  <span className="font-semibold" dir="ltr">{s.reference}</span>
                  <span className="mr-2 text-[.95rem] text-muted">· {s.parent_name} · {s.student_name} · {s.plan_name}</span>
                </span>
                <span className={`chip ${s.status === "active" ? "chip-ok" : s.status === "pending_payment" ? "chip-warn" : ""}`}>{SUB_STATUS[s.status]}</span>
              </summary>
              <div className="mt-4 grid gap-5 border-t border-line pt-4 md:grid-cols-2">
                <dl className="grid grid-cols-2 gap-3 text-[.95rem]">
                  <div><dt className="text-muted">البريد</dt><dd dir="ltr" className="text-right">{s.email}</dd></div>
                  <div><dt className="text-muted">المبلغ</dt><dd>{Number(s.price_sar)} ريال</dd></div>
                  <div><dt className="text-muted">المادة / المسار</dt><dd>{s.subject ? SUBJECTS[s.subject] : "كل المواد"} · {TRACKS[s.track].short}</dd></div>
                  <div><dt className="text-muted">الحصص</dt><dd>{s.used} / {s.sessions_total}</dd></div>
                  <div><dt className="text-muted">الطلب</dt><dd>{shortDate(s.created_at)}</dd></div>
                  <div><dt className="text-muted">الفترة</dt><dd>{s.starts_at ? `${shortDate(s.starts_at)} – ${shortDate(s.ends_at!)}` : "—"}</dd></div>
                  <div><dt className="text-muted">طلب سلة</dt><dd dir="ltr" className="text-right">{s.salla_order_id ?? "—"}</dd></div>
                  <div><dt className="text-muted">ملاحظة التفعيل</dt><dd>{s.activation_note ?? "—"}</dd></div>
                </dl>
                {s.status === "pending_payment" && (
                  <div className="space-y-3">
                    <ActionForm action={activateSubscriptionAction}>
                      <input type="hidden" name="id" value={s.id} />
                      <input name="order_id" className="input" placeholder="رقم طلب سلة" dir="ltr" />
                      <input name="note" className="input" placeholder="ملاحظة (مثلاً: تحويل بنكي تم التأكد منه)" />
                      <SubmitButton className="btn btn-primary btn-sm">تفعيل يدوي</SubmitButton>
                    </ActionForm>
                    <form action={voidSubscriptionAction}><input type="hidden" name="id" value={s.id} />
                      <button className="text-sm text-muted underline">إبطال الطلب (غير مدفوع)</button></form>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
