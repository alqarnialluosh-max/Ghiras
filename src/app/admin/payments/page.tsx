import { ActionForm } from "@/components/ActionForm";
import { Empty, PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { q } from "@/lib/db";
import { dateTimeLabel } from "@/lib/time";
import { activateSubscriptionAction, ignoreEventAction } from "../actions";

export const metadata = { title: "مدفوعات سلة" };

const MATCH: Record<string, [string, string]> = {
  matched: ["تطابق وتفعّل", "chip-ok"], unmatched: ["يحتاج مراجعة", "chip-warn"], ignored: ["متجاهل", ""], invalid_signature: ["توقيع غير صالح", "chip-bad"],
};

export default async function AdminPayments({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const all = (await searchParams).all === "1";
  const [events, pending] = await Promise.all([
    q<{ id: string; event: string; order_id: string | null; order_status: string | null; customer_email: string | null;
        amount_sar: string | null; product_refs: string[]; match_status: string; received_at: Date; reference: string | null }>(
      `SELECT e.id, e.event, e.order_id, e.order_status, e.customer_email, e.amount_sar, e.product_refs, e.match_status, e.received_at, s.reference
         FROM salla_events e LEFT JOIN subscriptions s ON s.id = e.subscription_id
        ${all ? "" : "WHERE e.match_status IN ('unmatched','matched')"}
        ORDER BY (e.match_status = 'unmatched') DESC, e.received_at DESC LIMIT 200`),
    q<{ id: string; reference: string; label: string }>(
      `SELECT s.id, s.reference, u.full_name || ' · ' || st.full_name || ' · ' || p.name_ar || ' · ' || u.email AS label
         FROM subscriptions s JOIN users u ON u.id = s.parent_id JOIN students st ON st.id = s.student_id JOIN plans p ON p.code = s.plan_code
        WHERE s.status = 'pending_payment' ORDER BY s.created_at DESC LIMIT 300`),
  ]);
  return (
    <>
      <PageTitle title="مدفوعات سلة" sub="كل إشعار دفع يصل من سلة يُحفظ هنا. اللي ما تطابق تلقائياً اربطه بطلب الاشتراك الصحيح."
        action={<a href={all ? "/admin/payments" : "/admin/payments?all=1"} className="btn btn-ghost btn-sm">{all ? "المهم فقط" : "عرض الكل"}</a>} />
      {events.length === 0 ? <Empty title="ما وصل أي إشعار من سلة بعد">تأكد من إعداد الـWebhook في سلة (الشرح في دليل التشغيل).</Empty> : (
        <div className="space-y-3">
          {events.map((e) => (
            <article key={e.id} className="panel p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-medium">طلب سلة <span dir="ltr">#{e.order_id ?? "—"}</span>
                  <span className="mr-2 text-[.95rem] font-normal text-muted">· {e.customer_email ?? "بدون بريد"} · {e.amount_sar ? `${Number(e.amount_sar)} ريال` : ""} · {e.order_status ?? e.event}</span></p>
                <span className={`chip ${MATCH[e.match_status]?.[1]}`}>{MATCH[e.match_status]?.[0]}{e.reference ? ` · ${e.reference}` : ""}</span>
              </div>
              <p className="mt-1 text-sm text-muted">{dateTimeLabel(e.received_at)} · منتجات: <span dir="ltr">{e.product_refs.join(", ") || "—"}</span></p>
              {e.match_status === "unmatched" && (
                <div className="mt-4 flex flex-col gap-3 border-t border-line pt-4 md:flex-row md:items-end">
                  <ActionForm action={activateSubscriptionAction} className="flex flex-1 flex-col gap-2 md:flex-row md:items-end">
                    <input type="hidden" name="event_id" value={e.id} />
                    <input type="hidden" name="order_id" value={e.order_id ?? ""} />
                    <input type="hidden" name="note" value="ربط يدوي من صفحة مدفوعات سلة" />
                    <select name="id" className="input flex-1" required defaultValue="">
                      <option value="" disabled>اختر طلب الاشتراك المطابق</option>
                      {pending.map((p) => <option key={p.id} value={p.id}>{p.reference} — {p.label}</option>)}
                    </select>
                    <SubmitButton className="btn btn-primary btn-sm">ربط وتفعيل</SubmitButton>
                  </ActionForm>
                  <form action={ignoreEventAction}><input type="hidden" name="id" value={e.id} />
                    <button className="btn btn-ghost btn-sm">تجاهل</button></form>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </>
  );
}
