import { requirePerm } from "@/lib/auth";
import { ActionForm } from "@/components/ActionForm";
import { PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { site } from "@/config/site";
import { getSetting } from "@/lib/accounting";
import { q } from "@/lib/db";
import { getPlans } from "@/lib/plans";
import { activeConnection, listProducts, sallaAppConfigured } from "@/lib/salla-api";
import { dateTimeLabel } from "@/lib/time";
import { sallaStatusSettingAction, sallaSyncAction, sallaTestAction, sallaUseProductAction } from "../actions";

export const metadata = { title: "ربط سلة" };

const ACTION_LABEL: Record<string, string> = {
  authorize: "ربط المتجر", revoke: "إلغاء الربط", refresh: "تجديد المفتاح", order_status: "تحديث حالة طلب", sync: "مزامنة الطلبات",
};

export default async function SallaPage() {
  await requirePerm("settings.manage");
  const [connInitial, plans, completeSlug, lastSync, logs, counts] = await Promise.all([
    activeConnection(), getPlans(true), getSetting("salla_complete_status", "completed"), getSetting("salla_last_sync", ""),
    q<{ id: string; action: string; order_id: string | null; ok: boolean; http_status: number | null; detail: string | null; created_at: Date }>(
      `SELECT * FROM salla_api_log ORDER BY id DESC LIMIT 25`),
    q<{ match_status: string; n: string }>(`SELECT match_status, count(*) n FROM salla_events GROUP BY 1`),
  ]);
  const configured = sallaAppConfigured();
  let products: Awaited<ReturnType<typeof listProducts>> = [];
  let productsError: string | null = null;
  let conn = connInitial;
  if (conn) {
    try { products = await listProducts(); }
    catch (e) {
      productsError = (e as Error).message;
      conn = await activeConnection(); // a failed refresh marks the connection as broken
    }
  }
  const broken = !!connInitial && !conn;
  const n = (k: string) => Number(counts.find((c) => c.match_status === k)?.n ?? 0);
  const webhookUrl = `${site.url.replace(/\/$/, "")}/api/webhooks/salla`;

  return (
    <>
      <PageTitle title="ربط سلة" sub={<>المتجر: <a href={site.sallaStore} target="_blank" rel="noopener noreferrer" className="text-lav-700 underline" dir="ltr">{site.sallaStore.replace("https://", "")}</a></>} />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5">
          <p className="text-sm text-muted">حالة الربط</p>
          <p className={`mt-1 font-display text-2xl ${conn ? "text-ok" : "text-bad"}`}>{conn ? "مربوط" : "غير مربوط"}</p>
          {conn && <p className="mt-1 text-sm text-muted">{conn.store_name ?? `تاجر ${conn.merchant_id}`}</p>}
        </div>
        <div className="panel p-5"><p className="text-sm text-muted">طلبات فُعّلت تلقائياً</p><p className="mt-1 font-display text-2xl">{n("matched")}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">تحتاج مراجعة</p><p className={`mt-1 font-display text-2xl ${n("unmatched") ? "text-warn" : ""}`}>{n("unmatched")}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">آخر مزامنة</p><p className="mt-1 text-[.95rem] font-medium">{lastSync ? dateTimeLabel(new Date(lastSync)) : "لم تتم بعد"}</p></div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <div className="space-y-8">
          {broken && (
            <p role="alert" className="alert alert-error">انقطع الربط مع سلة لأن مفتاح الوصول لم يعد صالحاً. أعد تثبيت التطبيق على المتجر من بوابة شركاء سلة لاستعادة الربط.</p>
          )}
          {!conn && (
            <section className="panel p-6" aria-labelledby="setup">
              <h2 id="setup" className="mb-3 text-xl">خطوات الربط (مرة واحدة)</h2>
              <ol className="list-decimal space-y-3 pr-6 text-[.97rem]">
                <li>ادخل <a href="https://salla.partners" target="_blank" rel="noopener noreferrer" className="text-lav-700 underline">بوابة شركاء سلة</a> بحساب المتجر، وأنشئ تطبيقاً جديداً من نوع <strong>تطبيق خاص (Private)</strong> باسم «غِراس».</li>
                <li>في إعدادات التطبيق اختر طريقة الربط <strong>Easy Mode</strong>.</li>
                <li>في الصلاحيات (Scopes) فعّل: <span dir="ltr" className="font-medium">orders.read_write · products.read · offline_access</span></li>
                <li>في «Webhooks / Notifications» ضع الرابط:
                  <code dir="ltr" className="mt-1 block break-all rounded-lg bg-wash p-2 text-sm">{webhookUrl}</code>
                  وفعّل أحداث: <span dir="ltr">order.created · order.status.updated</span>، واختر الحماية <strong>Signature</strong>.</li>
                <li>انسخ من صفحة التطبيق: <span dir="ltr">Client ID</span> و<span dir="ltr">Client Secret</span> و<span dir="ltr">Webhook Secret</span>، وضعها في Railway ← Variables بالأسماء:
                  <code dir="ltr" className="mt-1 block rounded-lg bg-wash p-2 text-sm leading-7">SALLA_CLIENT_ID<br />SALLA_CLIENT_SECRET<br />SALLA_WEBHOOK_SECRET  (أضف السر الجديد بعد فاصلة)</code></li>
                <li>ثبّت التطبيق على متجر <strong>ghirasedu</strong> من صفحة التطبيق، وستظهر هنا حالة «مربوط» تلقائياً.</li>
              </ol>
              <p className={`alert mt-4 ${configured ? "alert-ok" : "alert-info"}`}>
                {configured ? "مفاتيح التطبيق مضافة في الخادم ✓ — بقي تثبيت التطبيق على المتجر." : "مفاتيح التطبيق لم تُضف في Railway بعد."}
              </p>
            </section>
          )}

          {conn && (
            <section className="panel p-6" aria-labelledby="ops">
              <h2 id="ops" className="mb-1 text-xl">التحكم</h2>
              <p className="mb-4 text-sm text-muted">
                تعمل المزامنة تلقائياً كل 30 دقيقة لالتقاط أي طلب لم يصل إشعاره. ينتهي المفتاح الحالي {dateTimeLabel(conn.expires_at)}، ويُجدَّد تلقائياً قبلها بيوم.
              </p>
              <div className="flex flex-wrap gap-3">
                <ActionForm action={sallaSyncAction}><SubmitButton className="btn btn-primary btn-sm" pending="جارٍ المزامنة...">مزامنة الآن (آخر 7 أيام)</SubmitButton></ActionForm>
                <ActionForm action={sallaTestAction}><SubmitButton className="btn btn-ghost btn-sm" pending="جارٍ الفحص...">فحص الاتصال</SubmitButton></ActionForm>
              </div>
            </section>
          )}

          {conn && (
            <section aria-labelledby="products">
              <h2 id="products" className="mb-3 text-xl">منتجات المتجر وربطها بالباقات</h2>
              {productsError ? <p className="alert alert-error">تعذّر جلب المنتجات: {productsError}</p> : (
                <div className="panel overflow-x-auto">
                  <table className="table">
                    <thead><tr><th>المنتج في سلة</th><th>السعر</th><th>مربوط بـ</th><th>اربط بباقة</th></tr></thead>
                    <tbody>
                      {products.length === 0 && <tr><td colSpan={4} className="text-muted">لا توجد منتجات.</td></tr>}
                      {products.map((pr) => {
                        const linked = plans.find((p) => p.salla_product_id === String(pr.id));
                        return (
                          <tr key={pr.id}>
                            <td><p className="font-medium">{pr.name}</p><p className="text-xs text-muted" dir="ltr">#{pr.id}{pr.sku ? ` · ${pr.sku}` : ""}</p></td>
                            <td>{pr.price?.amount != null ? `${pr.price.amount} ﷼` : "—"}</td>
                            <td>{linked ? <span className="chip chip-ok">{linked.name_ar}</span> : <span className="text-muted">—</span>}</td>
                            <td>
                              <form action={sallaUseProductAction} className="flex gap-2">
                                <input type="hidden" name="product_id" value={pr.id} />
                                <input type="hidden" name="url" value={pr.urls?.customer ?? ""} />
                                <select name="plan" className="input min-h-[38px] py-1 text-sm" defaultValue={linked?.code ?? ""} required>
                                  <option value="" disabled>اختر الباقة</option>
                                  {plans.map((p) => <option key={p.code} value={p.code}>{p.name_ar}</option>)}
                                </select>
                                <button className="btn btn-ghost btn-sm">ربط</button>
                              </form>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          <section aria-labelledby="log">
            <h2 id="log" className="mb-3 text-xl">سجل التواصل مع سلة</h2>
            <div className="panel overflow-x-auto">
              <table className="table">
                <thead><tr><th>الوقت</th><th>العملية</th><th>الطلب</th><th>النتيجة</th></tr></thead>
                <tbody>
                  {logs.length === 0 && <tr><td colSpan={4} className="text-muted">لا توجد عمليات بعد.</td></tr>}
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td className="whitespace-nowrap text-sm">{dateTimeLabel(l.created_at)}</td>
                      <td>{ACTION_LABEL[l.action] ?? l.action}</td>
                      <td dir="ltr" className="text-right text-sm">{l.order_id ?? "—"}</td>
                      <td><span className={`chip ${l.ok ? "chip-ok" : "chip-bad"}`}>{l.ok ? "نجح" : "فشل"}</span>
                        {l.detail && <p className="mt-1 max-w-xs truncate text-xs text-muted" dir="ltr">{l.detail}</p>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-6" aria-labelledby="flow">
            <h2 id="flow" className="mb-3 text-lg">كيف يعمل الربط</h2>
            <ol className="list-decimal space-y-2 pr-6 text-[.95rem]">
              <li>يختار ولي الأمر الباقة في غِراس، ويُنقل إلى صفحة المنتج في سلة.</li>
              <li>يدفع في سلة، فترسل سلة إشعاراً موقّعاً إلى غِراس.</li>
              <li>يطابق النظام البريد أو الجوال والباقة، فيُفعَّل الاشتراك ويُسجَّل الإيراد في المحاسبة.</li>
              <li>يُحدِّث النظام حالة الطلب في سلة إلى «تم التنفيذ» تلقائياً.</li>
              <li>كل 30 دقيقة يراجع النظام آخر الطلبات في سلة، فلا يضيع طلب لو تأخر إشعاره.</li>
            </ol>
          </section>
          <section className="panel p-6" aria-labelledby="status-set">
            <h2 id="status-set" className="mb-3 text-lg">حالة الطلب في سلة بعد التفعيل</h2>
            <ActionForm action={sallaStatusSettingAction} className="space-y-3">
              <select name="slug" defaultValue={completeSlug} className="input">
                <option value="completed">تم التنفيذ (completed)</option>
                <option value="in_progress">قيد التنفيذ (in_progress)</option>
                <option value="">لا تغيّر الحالة</option>
              </select>
              <SubmitButton className="btn btn-ghost btn-sm">حفظ</SubmitButton>
            </ActionForm>
          </section>
          <section className="panel p-6">
            <h2 className="mb-2 text-lg">رابط الإشعارات</h2>
            <code dir="ltr" className="block break-all rounded-lg bg-wash p-2 text-sm">{webhookUrl}</code>
            <p className="mt-2 text-sm text-muted">يعمل مع إشعارات لوحة المتجر ومع تطبيق شركاء سلة معاً.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
