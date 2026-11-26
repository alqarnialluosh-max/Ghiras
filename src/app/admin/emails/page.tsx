import { Empty, PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { adminRecipient, emailMode } from "@/lib/email";
import { TEMPLATE_LABELS } from "@/lib/email-templates";
import { dateTimeLabel } from "@/lib/time";
import { flushEmailsAction } from "../actions";
import { TestEmailForm } from "./TestEmailForm";

export const metadata = { title: "البريد" };

const STATUS: Record<string, { label: string; tone: string }> = {
  sent: { label: "أُرسلت", tone: "bg-emerald-50 text-emerald-800" },
  queued: { label: "في الانتظار", tone: "bg-sky-50 text-sky-900" },
  failed: { label: "فشلت", tone: "bg-red-50 text-red-800" },
  skipped: { label: "لم تُرسل", tone: "bg-wash text-muted" },
};

export default async function EmailsPage() {
  const admin = await requireRole("admin");
  const mode = emailMode();
  const on = mode !== "off";
  const [counts, rows, unverified] = await Promise.all([
    q<{ status: string; n: string }>(`SELECT status, count(*) n FROM email_outbox WHERE created_at > now() - interval '30 days' GROUP BY status`),
    q<{ id: string; to_email: string; template: string; status: string; error: string | null; attempts: number; created_at: Date; sent_at: Date | null }>(
      `SELECT id, to_email, template, status, error, attempts, created_at, sent_at FROM email_outbox ORDER BY created_at DESC LIMIT 150`),
    q<{ n: string }>(`SELECT count(*) n FROM users WHERE email_verified_at IS NULL AND archived_at IS NULL`),
  ]);
  const c = Object.fromEntries(counts.map((r) => [r.status, Number(r.n)]));

  return (
    <>
      <PageTitle title="البريد الإلكتروني" sub="رسائل التأكيد والحجز والتذكير والتقارير، عبر Resend" />

      <section className="panel mb-6 p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`chip ${mode === "full" ? "chip-sky" : ""}`}>
            {mode === "full" ? "مفعّل" : mode === "owner_only" ? "مفعّل لتنبيهات المالك فقط" : "غير مفعّل"}
          </span>
          {mode === "full" && <span className="text-[.95rem] text-muted">يرسل من <span dir="ltr">{process.env.EMAIL_FROM}</span></span>}
        </div>
        {mode === "owner_only" && (
          <div className="mt-4 space-y-2 text-[.95rem]">
            <p>
              تصلك الآن تنبيهات طلبات المعلمات والاشتراكات الجديدة على <span dir="ltr" className="font-medium">{adminRecipient() || "—"}</span>.
              يجب أن يكون هذا هو البريد الذي فتحت به حساب Resend، وإلا فأضف في Railway المتغير <code dir="ltr">EMAIL_ADMIN_TO</code> بذلك البريد.
            </p>
            <p className="text-muted">
              رسائل أولياء الأمور والمعلمات (تأكيد البريد، الحجز، التذكير، التقرير، استعادة كلمة المرور) تحتاج دوميناً موثّقاً في Resend.
              بعد توثيقه أضف <code dir="ltr">EMAIL_FROM</code>، مثل <span dir="ltr">غِراس &lt;no-reply@ghiras.sa&gt;</span>، فتعمل كلها تلقائياً.
            </p>
          </div>
        )}
        {mode === "owner_only" && <TestEmailForm defaultTo={adminRecipient() || admin.email} />}
        {mode === "off" ? (
          <div className="mt-4 space-y-2 text-[.95rem]">
            <p>لتفعيل البريد أضف في Railway Variables:</p>
            <ul className="list-disc space-y-1 pr-5 text-muted">
              <li><code dir="ltr">RESEND_API_KEY</code>: المفتاح من لوحة Resend.</li>
              <li><code dir="ltr">EMAIL_FROM</code>: عنوان الإرسال على دومينك الموثّق، مثل <span dir="ltr">غِراس &lt;no-reply@ghiras.sa&gt;</span>.</li>
            </ul>
            <p className="text-muted">قبل التفعيل لا يُطلب تأكيد البريد من أحد، وتُسجَّل الرسائل هنا على أنها لم تُرسل.</p>
          </div>
        ) : mode === "full" ? (
          <TestEmailForm defaultTo={admin.email} />
        ) : null}
      </section>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        {[["sent", "أُرسلت (30 يوماً)"], ["queued", "في الانتظار"], ["failed", "فشلت"]].map(([k, l]) => (
          <div key={k} className="panel p-5"><p className="text-sm text-muted">{l}</p><p className="mt-1 font-display text-3xl">{c[k] ?? 0}</p></div>
        ))}
        <div className="panel p-5"><p className="text-sm text-muted">حسابات لم تؤكد بريدها</p><p className="mt-1 font-display text-3xl">{unverified[0]?.n ?? 0}</p></div>
      </div>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl">السجل</h2>
          {(c.queued ?? 0) > 0 && on && (
            <form action={flushEmailsAction}><button className="btn btn-ghost btn-sm">أرسل المنتظرة الآن</button></form>
          )}
        </div>
        {rows.length === 0 ? <Empty title="لم تُرسل أي رسالة بعد" /> : (
          <div className="panel overflow-x-auto">
            <table className="table">
              <thead><tr><th>الرسالة</th><th>إلى</th><th>الحالة</th><th>الوقت</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.id}>
                  <td>{TEMPLATE_LABELS[r.template] ?? r.template}</td>
                  <td dir="ltr" className="text-right text-sm">{r.to_email}</td>
                  <td>
                    <span className={`rounded-full px-2.5 py-0.5 text-sm ${STATUS[r.status]?.tone}`}>{STATUS[r.status]?.label ?? r.status}</span>
                    {r.error && r.status !== "skipped" && <p className="mt-1 max-w-xs text-xs text-red-800" dir="ltr">{r.error}</p>}
                  </td>
                  <td className="text-sm text-muted">{dateTimeLabel(r.sent_at ?? r.created_at)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
