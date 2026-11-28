import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { PageTitle } from "@/components/DashShell";
import { SubmitButton } from "@/components/forms";
import { q } from "@/lib/db";
import { SUBJECTS, type Subject } from "@/lib/domain";
import { autoMeetingsProvider, teamsAutoConfigured } from "@/lib/teams";
import { activeGoogleConnection, googleAppConfigured } from "@/lib/google-meet";
import { site } from "@/config/site";
import { dateTimeLabel } from "@/lib/time";
import { googleDisconnectAction, googleTestAction, teamsRetryAction, teamsTestAction } from "../actions";

export const metadata = { title: "الاجتماعات" };

const ACTION: Record<string, string> = { token: "تسجيل الدخول", create: "إنشاء اجتماع", cancel: "إلغاء اجتماع", test: "اختبار",
  "meet.create": "إنشاء اجتماع Meet", "meet.token": "دخول Google", "meet.authorize": "ربط Google" };

export default async function TeamsPage({ searchParams }: { searchParams: Promise<{ google_connected?: string; google_error?: string }> }) {
  await requirePerm("settings.manage");
  const sp = await searchParams;
  const provider = await autoMeetingsProvider();
  const auto = provider !== null;
  const msKeys = teamsAutoConfigured();
  const gKeys = googleAppConfigured();
  const gConn = await activeGoogleConnection();
  const [counts, pending, logs] = await Promise.all([
    q<{ src: string; n: string }>(
      `SELECT teams_source src, count(*) n FROM bookings WHERE status = 'scheduled' AND ends_at > now() GROUP BY 1`),
    q<{ id: string; starts_at: Date; subject: Subject; student: string; teacher: string; teams_link: string; teams_error: string | null; teams_attempts: number }>(
      `SELECT b.id, b.starts_at, b.subject, st.full_name student, t.full_name teacher, b.teams_link, b.teams_error, b.teams_attempts
         FROM bookings b JOIN students st ON st.id = b.student_id JOIN users t ON t.id = b.teacher_id
        WHERE b.status = 'scheduled' AND b.ends_at > now() AND b.teams_source <> 'auto'
        ORDER BY b.starts_at LIMIT 50`),
    q<{ id: string; action: string; ok: boolean; http_status: number | null; detail: string | null; created_at: Date }>(
      `SELECT * FROM teams_api_log ORDER BY id DESC LIMIT 20`),
  ]);
  const n = (k: string) => Number(counts.find((c) => c.src === k)?.n ?? 0);

  return (
    <>
      <PageTitle title="الاجتماعات" sub="رابط مستقل لكل حصة يُنشأ تلقائياً عند تأكيدها، ويظهر للعميل والمعلمة. Google Meet أولاً، وTeams بديلاً." />
      {sp.google_connected && <p role="status" className="alert alert-ok mb-6">رُبط حساب Google ✓ ستُنشأ روابط Google Meet تلقائياً للحصص من الآن.</p>}
      {sp.google_error && <p role="alert" className="alert alert-error mb-6">{sp.google_error}</p>}

      <section className="panel mb-8 p-6" aria-labelledby="gmeet">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="gmeet" className="text-xl">Google Meet</h2>
          <span className={`chip ${gConn && gKeys ? "chip-ok" : ""}`}>{gConn && gKeys ? "مربوط ويعمل" : gKeys ? "جاهز للربط" : "غير مفعّل"}</span>
        </div>
        {gConn && gKeys ? (
          <div className="mt-3 space-y-4">
            <p className="text-[.97rem]">الحساب المربوط: <span dir="ltr" className="font-medium">{gConn.email}</span> · منذ {dateTimeLabel(gConn.connected_at)}</p>
            <p className="text-sm text-muted">كل حصة تُؤكد تحصل على اجتماع Meet خاص يدخله الطالب والمعلمة مباشرة من الرابط، دون انتظار مضيف.</p>
            <div className="flex flex-wrap gap-3">
              <ActionForm action={googleTestAction}><SubmitButton className="btn btn-primary btn-sm" pending="جارٍ الاختبار...">اختبار الربط</SubmitButton></ActionForm>
              <a href="/api/google/connect" className="btn btn-ghost btn-sm">إعادة الربط بحساب آخر</a>
              <form action={googleDisconnectAction}><button className="btn btn-ghost btn-sm">فصل الحساب</button></form>
            </div>
          </div>
        ) : gKeys ? (
          <div className="mt-3 space-y-3">
            <p className="text-[.97rem]">اضغط الزر، وسجّل الدخول بحساب Google Workspace الخاص بالمنصة، ووافق على الصلاحية.</p>
            <a href="/api/google/connect" className="btn btn-primary w-fit">ربط Google Meet</a>
          </div>
        ) : (
          <ol className="mt-4 list-decimal space-y-3 pr-6 text-[.97rem]">
            <li>اشترك في <strong>Google Workspace Business Starter</strong> لمستخدم واحد بالدومين <span dir="ltr">ghirasedu.site</span> (مثل <span dir="ltr">meet@ghirasedu.site</span>).</li>
            <li>ادخل <a href="https://console.cloud.google.com" target="_blank" rel="noopener noreferrer" className="text-lav-700 underline" dir="ltr">console.cloud.google.com</a> بنفس الحساب، وأنشئ مشروعاً باسم <span dir="ltr">Ghiras</span>.</li>
            <li>APIs &amp; Services ← Library ← فعّل <strong dir="ltr">Google Meet REST API</strong>.</li>
            <li>OAuth consent screen ← نوع المستخدم <strong dir="ltr">Internal</strong> ← اسم التطبيق <span dir="ltr">Ghiras</span>.</li>
            <li>Credentials ← Create credentials ← <span dir="ltr">OAuth client ID</span> ← <span dir="ltr">Web application</span>، وفي <span dir="ltr">Authorized redirect URIs</span> أضف:
              <code dir="ltr" className="mt-1 block rounded-lg bg-wash p-2 text-sm">{site.url.replace(/\/$/, "")}/api/google/callback</code></li>
            <li>انسخ <span dir="ltr">Client ID</span> و<span dir="ltr">Client secret</span> إلى Railway باسم <code dir="ltr">GOOGLE_CLIENT_ID</code> و<code dir="ltr">GOOGLE_CLIENT_SECRET</code>، ثم ارجع هنا واضغط «ربط Google Meet».</li>
          </ol>
        )}
      </section>

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="panel p-5"><p className="text-sm text-muted">وضع الروابط</p>
          <p className={`mt-1 font-display text-2xl ${auto ? "text-ok" : "text-warn"}`}>{provider === "google" ? "Google Meet" : provider === "teams" ? "Teams" : "رابط المعلمة الثابت"}</p>
          {provider === "teams" && <p className="mt-1 text-sm text-muted" dir="ltr">{process.env.MS_ORGANIZER}</p>}</div>
        <div className="panel p-5"><p className="text-sm text-muted">حصص قادمة برابط مستقل</p><p className="mt-1 font-display text-2xl text-ok">{n("auto")}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">برابط المعلمة الثابت</p><p className="mt-1 font-display text-2xl">{n("teacher_link")}</p></div>
        <div className="panel p-5"><p className="text-sm text-muted">بانتظار إنشاء الرابط</p><p className={`mt-1 font-display text-2xl ${n("pending") ? "text-warn" : ""}`}>{n("pending")}</p></div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1.15fr_.85fr]">
        <div className="space-y-8">
          {!msKeys && provider !== "google" && (
            <section className="panel p-6" aria-labelledby="setup">
              <h2 id="setup" className="mb-3 text-xl">بديل: Microsoft Teams</h2>
              <ol className="list-decimal space-y-4 pr-6 text-[.97rem]">
                <li><strong>اشترك في Microsoft 365 Business Basic</strong> لمستخدم واحد من
                  {" "}<a href="https://www.microsoft.com/microsoft-365/business/microsoft-365-business-basic" target="_blank" rel="noopener noreferrer" className="text-lav-700 underline">موقع مايكروسوفت</a>.
                  أنشئ حساباً باسم مثل <span dir="ltr">sessions@…onmicrosoft.com</span>، فهو «منظِّم» كل الحصص. لا تحتاج دوميناً خاصاً.</li>
                <li><strong>سجّل تطبيقاً في Microsoft Entra</strong>: ادخل
                  {" "}<a href="https://entra.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-lav-700 underline" dir="ltr">entra.microsoft.com</a>
                  {" "}← Applications ← App registrations ← New registration، وسمّه «Ghiras». انسخ <span dir="ltr">Application (client) ID</span> و<span dir="ltr">Directory (tenant) ID</span>.</li>
                <li><strong>أنشئ مفتاحاً سرياً</strong>: من التطبيق ← Certificates &amp; secrets ← New client secret (مدة 24 شهراً)، وانسخ قيمة <span dir="ltr">Value</span> فوراً.</li>
                <li><strong>امنح الصلاحية</strong>: API permissions ← Add a permission ← Microsoft Graph ← <strong>Application permissions</strong> ← <span dir="ltr" className="font-medium">Calendars.ReadWrite</span> ← Add، ثم اضغط <strong>Grant admin consent</strong>.</li>
                <li><strong>اسمح بالدخول دون انتظار</strong>: في
                  {" "}<a href="https://admin.teams.microsoft.com" target="_blank" rel="noopener noreferrer" className="text-lav-700 underline" dir="ltr">admin.teams.microsoft.com</a>
                  {" "}← Meetings ← Meeting policies ← Global: فعّل «Anonymous users can join a meeting»، واجعل «Who can bypass the lobby» = <strong>Everyone</strong>، و«Who can present» = <strong>Everyone</strong>. بذلك تدخل المعلمة والطالب مباشرة دون منظِّم يسمح لهم.</li>
                <li><strong>أضف المفاتيح في Railway</strong> ← ghiras-web ← Variables:
                  <code dir="ltr" className="mt-1 block rounded-lg bg-wash p-2 text-sm leading-7">MS_TENANT_ID<br />MS_CLIENT_ID<br />MS_CLIENT_SECRET<br />MS_ORGANIZER  (بريد حساب المنظِّم)</code></li>
                <li>ارجع لهذه الصفحة واضغط <strong>اختبار الربط</strong>.</li>
              </ol>
              <p className="alert alert-info mt-4">حتى التفعيل، تعمل الحصص بالرابط الثابت لكل معلمة كما هو الآن.</p>
            </section>
          )}

          {auto && (
            <section className="panel p-6" aria-labelledby="ops">
              <h2 id="ops" className="mb-1 text-xl">التحكم</h2>
              <p className="mb-4 text-sm text-muted">يُعاد المحاولة تلقائياً كل 15 دقيقة لأي حصة لم يُنشأ رابطها. وعند إعادة الجدولة يُلغى الاجتماع القديم ويُنشأ جديد.</p>
              <div className="flex flex-wrap gap-3">
                {msKeys && <ActionForm action={teamsTestAction}><SubmitButton className="btn btn-ghost btn-sm" pending="جارٍ الاختبار...">اختبار Teams</SubmitButton></ActionForm>}
                <ActionForm action={teamsRetryAction}><SubmitButton className="btn btn-ghost btn-sm" pending="جارٍ الإنشاء...">أنشئ الروابط الناقصة الآن</SubmitButton></ActionForm>
              </div>
            </section>
          )}

          <section aria-labelledby="pending">
            <h2 id="pending" className="mb-3 text-xl">حصص قادمة بدون رابط مستقل ({pending.length})</h2>
            <div className="panel overflow-x-auto">
              <table className="table">
                <thead><tr><th>الموعد</th><th>الحصة</th><th>الرابط الحالي</th></tr></thead>
                <tbody>
                  {pending.length === 0 && <tr><td colSpan={3} className="text-muted">كل الحصص القادمة لها روابط مستقلة.</td></tr>}
                  {pending.map((b) => (
                    <tr key={b.id}>
                      <td className="whitespace-nowrap"><Link href={`/admin/bookings/${b.id}`} className="text-lav-700 underline">{dateTimeLabel(b.starts_at)}</Link></td>
                      <td>{SUBJECTS[b.subject]} · {b.student} مع {b.teacher}</td>
                      <td>{b.teams_link ? <span className="chip">رابط المعلمة</span> : <span className="chip chip-warn">لا يوجد بعد</span>}
                        {b.teams_error && <p className="mt-1 max-w-xs truncate text-xs text-bad">{b.teams_error} ({b.teams_attempts} محاولات)</p>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="log">
            <h2 id="log" className="mb-3 text-xl">سجل التواصل مع مايكروسوفت</h2>
            <div className="panel overflow-x-auto">
              <table className="table">
                <thead><tr><th>الوقت</th><th>العملية</th><th>النتيجة</th></tr></thead>
                <tbody>
                  {logs.length === 0 && <tr><td colSpan={3} className="text-muted">لا توجد عمليات بعد.</td></tr>}
                  {logs.map((l) => (
                    <tr key={l.id}><td className="whitespace-nowrap text-sm">{dateTimeLabel(l.created_at)}</td><td>{ACTION[l.action] ?? l.action}</td>
                      <td><span className={`chip ${l.ok ? "chip-ok" : "chip-bad"}`}>{l.ok ? "نجح" : "فشل"}</span>
                        {l.detail && <p className="mt-1 max-w-xs truncate text-xs text-muted" dir="ltr">{l.detail}</p>}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <aside className="space-y-6">
          <section className="panel p-6">
            <h2 className="mb-3 text-lg">كيف يعمل</h2>
            <ol className="list-decimal space-y-2 pr-6 text-[.95rem]">
              <li>يحجز ولي الأمر الحصة.</li>
              <li>يُنشئ النظام موعداً في تقويم حساب غِراس مع اجتماع Teams خاص بهذه الحصة فقط.</li>
              <li>يظهر الرابط فوراً في صفحة الحصة لولي الأمر والمعلمة.</li>
              <li>إن تعذّر الإنشاء لأي سبب، تبقى الحصة على رابط المعلمة الثابت ويُعاد المحاولة تلقائياً.</li>
            </ol>
          </section>
          <section className="panel p-6">
            <h2 className="mb-2 text-lg">لماذا رابط لكل حصة؟</h2>
            <p className="text-[.95rem] text-muted">لا يدخل طالب حصة طالب آخر بالخطأ، ويبقى لكل حصة سجلها في التقويم، ولا تتأثر الحصص إذا غادرت معلمة المنصة.</p>
          </section>
        </aside>
      </div>
    </>
  );
}
