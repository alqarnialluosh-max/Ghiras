import { site } from "@/config/site";

/** Arabic, right-to-left emails. Plain tables + inline styles so they render in Gmail, Outlook and phone mail apps. */
export type Rendered = { subject: string; html: string; text: string };
type P = Record<string, string>;

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const absUrl = (path: string) => `${site.url.replace(/\/$/, "")}${path}`;

function layout(o: { title: string; lines: string[]; cta?: { label: string; href: string }; note?: string }): Rendered & { subject: string } {
  const body = o.lines.map((l) => `<p style="margin:0 0 14px;font-size:16px;line-height:1.8;color:#312a56">${esc(l)}</p>`).join("");
  const button = o.cta
    ? `<p style="margin:26px 0"><a href="${esc(o.cta.href)}" style="display:inline-block;background:#5b45b0;color:#ffffff;text-decoration:none;font-weight:bold;font-size:16px;padding:13px 28px;border-radius:999px">${esc(o.cta.label)}</a></p>
       <p style="margin:0 0 14px;font-size:13px;color:#6b6489">إذا لم يعمل الزر، انسخ هذا الرابط في المتصفح:<br><span dir="ltr" style="word-break:break-all">${esc(o.cta.href)}</span></p>`
    : "";
  const note = o.note ? `<p style="margin:18px 0 0;font-size:13px;color:#6b6489">${esc(o.note)}</p>` : "";
  const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(o.title)}</title></head>
<body style="margin:0;background:#f6f4fc;font-family:Tahoma,Arial,sans-serif" dir="rtl">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f4fc;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;text-align:right">
<tr><td style="background:#ece7fb;padding:20px 28px;font-size:26px;font-weight:bold;color:#5b45b0">غِراس</td></tr>
<tr><td style="padding:28px">
<h1 style="margin:0 0 18px;font-size:21px;line-height:1.5;color:#231d45">${esc(o.title)}</h1>
${body}${button}${note}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid #ece9f5;font-size:12px;color:#8a84a6;line-height:1.8">
غِراس · حصص فردية أونلاين تحت إشراف ${esc(site.supervisor.name)}<br>
للتواصل: <span dir="ltr">${esc(site.contact.email)}</span>
</td></tr></table></td></tr></table></body></html>`;
  const text = [o.title, "", ...o.lines, ...(o.cta ? ["", `${o.cta.label}: ${o.cta.href}`] : []), ...(o.note ? ["", o.note] : []), "", "غِراس"].join("\n");
  return { subject: o.title, html, text };
}

/** Templates that carry a one-time link get it in `link`; that value is never stored. */
export const TEMPLATES: Record<string, (p: P) => Rendered> = {
  verify_email: (p) => layout({
    title: "أكّد بريدك الإلكتروني في غِراس",
    lines: [`أهلاً ${p.name}،`, "اضغط الزر لتأكيد بريدك. نستخدمه لإرسال مواعيد الحصص وتقاريرها، ولتفعيل اشتراكك بعد الدفع."],
    cta: { label: "تأكيد البريد", href: p.link },
    note: "الرابط صالح لمدة 48 ساعة. إذا لم تنشئ حساباً في غِراس فتجاهل هذه الرسالة.",
  }),
  reset_password: (p) => layout({
    title: "إعادة تعيين كلمة المرور",
    lines: [`أهلاً ${p.name}،`, "وصلنا طلب لإعادة تعيين كلمة المرور لحسابك في غِراس. اضغط الزر لاختيار كلمة مرور جديدة."],
    cta: { label: "اختيار كلمة مرور جديدة", href: p.link },
    note: "الرابط صالح لمدة ساعة واحدة ويُستخدم مرة واحدة. إذا لم تطلب ذلك فتجاهل الرسالة، وستبقى كلمة مرورك كما هي.",
  }),
  booking_parent: (p) => layout({
    title: `تم حجز حصة ${p.subject} لـ${p.student}`,
    lines: [`الموعد: ${p.date}، الساعة ${p.time} بتوقيت الرياض.`, `المعلمة: ${p.teacher}.`, "تجد رابط Teams ووصف الحصة في صفحتها، ويُتاح زر الدخول قبل الموعد بربع ساعة."],
    cta: { label: "صفحة الحصة", href: absUrl(`/parent/sessions/${p.booking}`) },
  }),
  booking_teacher: (p) => layout({
    title: `حصة جديدة: ${p.subject} · ${p.date}`,
    lines: [`أهلاً ${p.name}،`, `حُجزت لكِ حصة مع ${p.student} (${p.grade})، يوم ${p.date} الساعة ${p.time} بتوقيت الرياض.`, "تجدين وصف الحصة وأهداف الأسرة ورابط Teams في صفحة الحصة."],
    cta: { label: "صفحة الحصة", href: absUrl(`/teacher/sessions/${p.booking}`) },
  }),
  rescheduled: (p) => layout({
    title: "تغيّر موعد الحصة",
    lines: [`أصبح موعد حصة ${p.subject} مع ${p.student}: ${p.date}، الساعة ${p.time} بتوقيت الرياض.`, `المعلمة: ${p.teacher}.`, "رابط Teams الجديد في صفحة الحصة."],
    cta: { label: "صفحة الحصة", href: absUrl(p.path) },
  }),
  reminder: (p) => layout({
    title: `تذكير: حصة ${p.subject} اليوم الساعة ${p.time}`,
    lines: [p.role === "teacher" ? `حصتكِ مع ${p.student} تبدأ الساعة ${p.time} بتوقيت الرياض.` : `حصة ${p.student} مع ${p.teacher} تبدأ الساعة ${p.time} بتوقيت الرياض.`,
      "يُتاح زر الدخول في صفحة الحصة قبل الموعد بربع ساعة."],
    cta: { label: "صفحة الحصة", href: absUrl(p.path) },
  }),
  report_ready: (p) => layout({
    title: `تقرير حصة ${p.student} جاهز`,
    lines: [`كتبت ${p.teacher} تقرير حصة ${p.subject} (${p.date}): ما شُرح، ومستوى الاستيعاب، والواجب، وخطة الحصة القادمة.`],
    cta: { label: "قراءة التقرير", href: absUrl(`/parent/sessions/${p.booking}`) },
  }),
  subscription_active: (p) => layout({
    title: `تم تفعيل ${p.plan}`,
    lines: [`أهلاً ${p.name}، وصلنا الدفع وفُعّل اشتراك ${p.student}.`, `رقم الاشتراك: ${p.reference}. يمكنك حجز الحصص الآن.`],
    cta: { label: "احجز أول حصة", href: absUrl("/parent/book") },
  }),
  teacher_received: (p) => layout({
    title: "وصلنا طلب انضمامكِ إلى غِراس",
    lines: [`أهلاً ${p.name}،`, "شكراً لاهتمامكِ بالتدريس معنا. تراجع الإدارة سيرتكِ الذاتية، وسنتواصل معكِ لتحديد موعد المقابلة."],
    cta: { label: "حسابي", href: absUrl("/teacher") },
  }),
  teacher_approved: (p) => layout({
    title: "تم اعتمادكِ معلمةً في غِراس",
    lines: [`أهلاً ${p.name}، مرحباً بكِ في فريق غِراس.`, "أصبح بإمكان أولياء الأمور حجز حصص معكِ. حدّثي أوقات تفرغكِ ليظهر اسمكِ في المواعيد المناسبة."],
    cta: { label: "أوقات التفرغ", href: absUrl("/teacher/availability") },
  }),
  admin_new_teacher: (p) => layout({
    title: `طلب انضمام معلمة: ${p.name}`,
    lines: [`المواد: ${p.subjects}.`, "السيرة الذاتية مرفقة في صفحتها."],
    cta: { label: "مراجعة الطلب", href: absUrl(`/admin/teachers/${p.teacher}`) },
  }),
  admin_new_subscription: (p) => layout({
    title: `اشتراك جديد مدفوع: ${p.plan}`,
    lines: [`ولي الأمر: ${p.name}.`, `رقم الاشتراك: ${p.reference}.`],
    cta: { label: "المشتركون", href: absUrl("/admin/subscribers") },
  }),
  test: () => layout({ title: "رسالة تجريبية من غِراس", lines: ["إذا وصلتك هذه الرسالة فالبريد يعمل بشكل صحيح."] }),
};

export const TEMPLATE_LABELS: Record<string, string> = {
  verify_email: "تأكيد البريد", reset_password: "استعادة كلمة المرور", booking_parent: "تأكيد حجز (ولي أمر)",
  booking_teacher: "حصة جديدة (معلمة)", rescheduled: "تغيير موعد", reminder: "تذكير بالحصة", report_ready: "تقرير جاهز",
  subscription_active: "تفعيل اشتراك", teacher_received: "استلام طلب معلمة", teacher_approved: "اعتماد معلمة",
  admin_new_teacher: "تنبيه: معلمة جديدة", admin_new_subscription: "تنبيه: اشتراك جديد", test: "تجريبية",
};
