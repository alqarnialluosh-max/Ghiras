import Link from "next/link";
import { Seedling } from "@/components/Seedling";
import { localPhone } from "@/components/ContactLinks";
import { site } from "@/config/site";
import { getPlans, planPrice, planSessionsLine, type Plan } from "@/lib/plans";
import { SessionReportCard } from "@/components/SessionReportCard";
import { SAMPLE_REPORT } from "@/lib/report";
import { POLICY } from "@/lib/policy";
import { TRACKS } from "@/lib/domain";

export const dynamic = "force-dynamic";

const PLAN_POINTS: Record<string, string[]> = {
  ALL_SUBJECTS: [
    "حصص فردية لابنك وحده، لا مجموعات",
    "الرياضيات ولغتي والعلوم، كل مادة مع معلمتها المختصة",
    "الحصة الأولى المجانية لتشخيص المستوى ووضع خطة الأسابيع القادمة",
    "متابعة للمنهج وتهيئة للاختبارات",
    "تقرير بعد الحصة: ما شُرح، ونقاط القوة، والواجب",
  ],
  SINGLE_SUBJECT: [
    "حصص فردية لابنك وحده، لا مجموعات",
    "مادة واحدة تختارونها، مع معلمتها المختصة",
    "في الوقت الذي يناسبكم",
    "متابعة للمنهج وتهيئة للاختبارات",
    "تقرير بعد الحصة: ما شُرح، ونقاط القوة، والواجب",
  ],
  SINGLE_SESSION: [
    "حصة فردية لابنك، ساعة كاملة في أي مادة",
    "استعداد لاختبار، أو حل واجبات، أو شرح درس كامل",
    "تختارون المعلمة والوقت بأنفسكم",
  ],
};

function TrackIcon({ kind }: { kind: "remedial" | "followup" | "exam_prep" }) {
  // Roots → stem → bloom: the same plant, three stages of need
  if (kind === "remedial")
    return (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <path d="M8 26h48" stroke="#dcd2fa" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 12v14M32 26c0 10-8 12-12 22M32 26c0 10 8 12 12 22M32 26v26" stroke="#5b45b0" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M32 14c0-5-4-8-9-8 0 5 4 8 9 8Z" fill="#a994ee" />
      </svg>
    );
  if (kind === "followup")
    return (
      <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
        <path d="M32 58V14" stroke="#5b45b0" strokeWidth="3" strokeLinecap="round" />
        <path d="M32 44c0-7-6-11-14-11 0 7 6 11 14 11Z" fill="#a994ee" />
        <path d="M32 32c0-7 6-11 14-11 0 7-6 11-14 11Z" fill="#8ed1f2" />
        <path d="M32 20c0-6-5-9-11-9 0 6 5 9 11 9Z" fill="#c2b3f4" />
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" className="h-14 w-14" aria-hidden="true">
      <path d="M32 58V30" stroke="#5b45b0" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 48c0-6-5-9-12-9 0 6 5 9 12 9Z" fill="#a994ee" />
      {[0, 72, 144, 216, 288].map((r) => (
        <ellipse key={r} cx="32" cy="14" rx="5.5" ry="9" fill="#8ed1f2" transform={`rotate(${r} 32 22)`} />
      ))}
      <circle cx="32" cy="22" r="5" fill="#5b45b0" />
    </svg>
  );
}

function SessionCardMock() {
  return (
    <div className="panel w-full max-w-md p-5 shadow-[0_18px_40px_-24px_rgba(91,69,176,.45)]" aria-label="مثال لبطاقة حصة">
      <div className="flex items-center justify-between">
        <span className="chip chip-sky">الرياضيات · متابعة</span>
        <span className="text-sm text-muted">الثلاثاء 5:00 م</span>
      </div>
      <p className="mt-4 font-display text-xl">الكسور العشرية — الدرس الثالث</p>
      <p className="mt-1 text-[.95rem] text-muted">مع أ. نورة · حصة فردية · الخامس الابتدائي · ساعة كاملة</p>
      <p className="mt-3 rounded-xl bg-wash p-3 text-[.92rem]">
        نرغب في مراجعة واجب صفحة 42 والتدرب على المسائل اللفظية قبل اختبار الأسبوع القادم.
      </p>
      <div className="mt-4 flex items-center gap-3">
        <span className="btn btn-sky btn-sm pointer-events-none">ادخل الحصة على Teams</span>
        <span className="text-sm text-muted">يُتاح قبل الموعد بربع ساعة</span>
      </div>
    </div>
  );
}

function PricingCard({ plan, featured }: { plan: Plan; featured: boolean }) {
  const total = plan.sessions_count + plan.bonus_sessions;
  return (
    <article
      className={
        featured
          ? "relative rounded-[22px] bg-lav-700 p-7 text-white md:-my-4 md:p-9"
          : "rounded-[22px] border-[1.5px] border-line bg-white p-7"
      }
    >
      <h3 className={`text-2xl ${featured ? "text-white" : ""}`}>{plan.name_ar}</h3>
      <p className={`mt-1 text-[.95rem] ${featured ? "text-lav-100" : "text-muted"}`}>
        {planSessionsLine(plan)}
      </p>
      <p className="mt-6 flex items-baseline gap-2">
        <span className="font-display text-5xl">{planPrice(plan)}</span>
        <span className={featured ? "text-lav-100" : "text-muted"}>ريال {plan.code === "SINGLE_SESSION" ? "للحصة" : "بالشهر"}</span>
      </p>
      {plan.bonus_sessions > 0 && (
        <p className="mt-3 inline-block rounded-full bg-sky-300 px-3 py-1 text-sm font-medium text-ink">
          {total} حصص بسعر {plan.sessions_count}
        </p>
      )}
      <ul className={`mt-6 space-y-3 text-[.97rem] ${featured ? "text-white" : ""}`}>
        {(PLAN_POINTS[plan.code] ?? []).map((p) => (
          <li key={p} className="flex gap-3">
            <span aria-hidden="true" className={`mt-[.6rem] h-2.5 w-2.5 flex-none rounded-full rounded-tr-none ${featured ? "bg-sky-300" : "bg-lav-400"}`} />
            <span>{p}</span>
          </li>
        ))}
      </ul>
      <Link
        href={`/parent/subscribe?plan=${plan.code}`}
        className={`btn mt-8 w-full ${featured ? "bg-white text-lav-700 hover:bg-lav-100" : "btn-ghost"}`}
      >
        اشترك في {plan.name_ar}
      </Link>
    </article>
  );
}

function faqFor(plans: Plan[]) {
  const all = plans.find((p) => p.code === "ALL_SUBJECTS");
  return [
    { q: "هل الحصص فردية أم جماعية؟", a: "جميع حصص غِراس فردية: معلمة واحدة مع ابنك أو ابنتك فقط طوال الساعة، دون أي طلاب آخرين، فيكون الشرح على قدر مستواه وبالسرعة التي تناسبه." },
    { q: "هل الحصص للبنين والبنات؟", a: "نعم، للبنين والبنات من الصف الأول الابتدائي إلى الثالث المتوسط. وجميع من يدرّسن في غِراس معلمات، والحصص أونلاين من المنزل." },
    ...(all ? [{ q: "كم حصة في باقة كل المواد، وكيف تتوزع؟", a: `${planSessionsLine(all)}. توزعون الحصص على الرياضيات ولغتي والعلوم حسب حاجة ابنكم، فقد تكون أغلبها في مادة واحدة إن كانت هي الأصعب، وتدرّس كل مادة معلمة متخصصة فيها.` }] : []),
    { q: "ماذا يحدث في الحصة الأولى المجانية؟", a: "هي حصة تعرّف وتشخيص: تقيس المعلمة مستوى ابنك في المادة، وتكتب في تقرير الحصة نقاط قوته وما يحتاج إليه، وخطة مقترحة للأسابيع القادمة." },
    { q: "ماذا يصلني بعد الحصة؟", a: "تقرير قصير في صفحة الحصة: ما شُرح، ومستوى الاستيعاب، ونقاط القوة، وما يحتاج إلى دعم، والواجب، وخطة الحصة القادمة." },
    { q: "هل يمكنني اختيار المعلمة أو تغييرها؟", a: "نعم. تختارون اليوم والوقت أولاً، ثم تظهر لكم المعلمات المتاحات في ذلك الوقت للمادة المطلوبة. " + POLICY.switchTeacher },
    { q: "إذا طرأ ظرف، هل يمكنني تأجيل الحصة؟", a: POLICY.reschedule + " ولا تُلغى الحصص المحجوزة من الموقع حفاظاً على وقت المعلمات وسجل الطالب." },
    { q: "ماذا لو تغيبت المعلمة؟", a: POLICY.teacherAbsent },
    { q: "كيف تُقدَّم الحصة؟", a: "عبر Microsoft Teams. بعد الحجز تظهر لكم صفحة الحصة وفيها وصفها ورابط Teams جاهز، ويُتاح زر الدخول قبل الموعد بربع ساعة. لا تحتاجون إلى حساب في Teams، إذ يكفي المتصفح أو التطبيق." },
    { q: "كيف أدفع؟", a: "يتم الدفع عبر متجر غِراس على منصة سلة وبطرق الدفع المتاحة فيها، ويُفعَّل اشتراككم تلقائياً بعد الدفع. يكفي أن تستخدموا البريد أو رقم الجوال نفسه المسجل في حسابكم في غِراس." },
    { q: "كيف أتواصل معكم؟", a: "عبر واتساب على الرقمين الظاهرين أسفل الصفحة، أو بالبريد الإلكتروني. ونرد على استفساراتكم وطلبات إعادة الجدولة في أقرب وقت." },
    { q: "هل بيانات أبنائي آمنة؟", a: "نعم. الاتصال مشفّر، وأرقام الجوال والملاحظات الخاصة تُحفظ مشفّرة، وكلمات المرور لا تُخزَّن أبداً بشكلها الأصلي. وسجل الطالب وحصصه محفوظ ولا يُحذف." },
  ];
}

export default async function Home() {
  const plans = await getPlans().catch(() => [] as Plan[]);
  const s = site.supervisor;

  return (
    <>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden">
        <div aria-hidden="true" className="pointer-events-none absolute -left-40 top-10 h-[520px] w-[520px] rounded-full bg-sky-50" />
        <div className="wrap relative grid items-center gap-10 py-14 md:grid-cols-[1.1fr_.9fr] md:py-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-lav-100 px-4 py-1.5 text-[.92rem] text-lav-700">
              بإشراف {s.name}
            </p>
            <h1 className="text-[2.6rem] leading-[1.25] md:text-[3.6rem]">
              نزرع الفهم،
              <br />
              ونرعاه كل أسبوع.
            </h1>
            <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 text-lg font-medium text-lav-700 md:text-xl">
              {site.slogan.map((s, i) => (
                <span key={s} aria-hidden="true" className="flex items-center gap-3">
                  {i > 0 && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-sky-300" />}
                  {i > 0 ? s.replace(/^و/, "") : s}
                </span>
              ))}
              <span className="sr-only">{site.slogan.join("، ")}</span>
            </p>
            <p className="mt-5 max-w-[34rem] text-lg text-muted md:text-xl">
              حصص فردية خاصة بابنك أو ابنتك: معلمة واحدة لطالب واحد، أونلاين على Teams في الرياضيات ولغتي والعلوم، للصفوف من الأول الابتدائي إلى الثالث المتوسط. أنتم تختارون الوقت والمعلمة.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#pricing" className="btn btn-primary">اختر باقتك</a>
              <a href="#how" className="btn btn-ghost">كيف نعمل</a>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4 border-t border-line pt-6 text-center md:text-start">
              <div><dt className="text-sm text-muted">مدة الحصة</dt><dd className="font-display text-xl">ساعة كاملة</dd></div>
              <div><dt className="text-sm text-muted">نوع الحصة</dt><dd className="font-display text-xl">فردية لابنك</dd></div>
              <div><dt className="text-sm text-muted">الحصة الأولى</dt><dd className="font-display text-xl">مجاناً</dd></div>
            </dl>
          </div>
          <div className="flex justify-center md:justify-start">
            <Seedling />
          </div>
        </div>
      </section>

      {/* ---------- Supervision ---------- */}
      <section aria-labelledby="supervisor" className="bg-wash py-16 md:py-20">
        <div className="wrap grid gap-10 md:grid-cols-[.8fr_1.2fr] md:items-start">
          <div>
            <h2 id="supervisor" className="text-3xl md:text-4xl">تحت إشراف {s.name}</h2>
            <p className="mt-2 text-muted">{s.title}{s.yearsExperience ? ` · خبرة ${s.yearsExperience} سنة في التعليم` : ""}</p>
          </div>
          <div>
            <p className="max-w-[40rem] text-lg leading-9">{s.bio}</p>
            <ul className="mt-7 grid gap-4 sm:grid-cols-3">
              {s.highlights.map((h) => (
                <li key={h} className="border-r-[3px] border-lav-400 pr-4 text-[.97rem]">{h}</li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ---------- Tracks ---------- */}
      <section id="tracks" aria-labelledby="tracks-h" className="wrap scroll-mt-24 py-20">
        <h2 id="tracks-h" className="max-w-xl text-3xl md:text-4xl">ثلاث مسارات، حسب احتياج ابنك</h2>
        <p className="mt-3 max-w-xl text-muted">كل الحصص فردية لابنك. تختارون المسار عند الاشتراك، وتبني المعلمة الحصص عليه حسب مستواه.</p>
        <div className="mt-12 grid gap-x-10 gap-y-12 md:grid-cols-3">
          {(Object.keys(TRACKS) as (keyof typeof TRACKS)[]).map((k) => (
            <div key={k}>
              <TrackIcon kind={k} />
              <h3 className="mt-4 text-2xl">{TRACKS[k].name}</h3>
              <p className="mt-2 text-muted">{TRACKS[k].desc}</p>
            </div>
          ))}
        </div>
        <div className="mt-16 flex flex-wrap items-center gap-x-8 gap-y-3 rounded-[22px] bg-sky-50 px-7 py-6">
          <p className="font-display text-xl">المواد:</p>
          <p className="text-lg">الرياضيات</p>
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
          <p className="text-lg">لغتي العربية</p>
          <span className="h-1.5 w-1.5 rounded-full bg-sky-300" aria-hidden="true" />
          <p className="text-lg">العلوم</p>
          <p className="text-muted md:mr-auto">من الأول الابتدائي إلى الثالث المتوسط</p>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" aria-labelledby="how-h" className="scroll-mt-24 border-y border-line py-20">
        <div className="wrap grid gap-12 md:grid-cols-[1fr_.9fr] md:items-center">
          <div>
            <h2 id="how-h" className="text-3xl md:text-4xl">من الاشتراك إلى أول حصة</h2>
            <ol className="mt-10 space-y-8">
              {[
                ["أنشئ حسابك وأضف أبناءك", "اسم الطالب وصفه الدراسي، ويمكنك إضافة أكثر من ابن في الحساب نفسه."],
                ["اختر الباقة وادفع عبر سلة", "ننقلك إلى متجرنا في سلة، ويُفعَّل الاشتراك تلقائياً بعد الدفع."],
                ["اختر اليوم والوقت، ثم المعلمة", "تظهر لك الأوقات المتاحة فعلاً، ثم المعلمات المتاحات في ذلك الوقت."],
                ["ادخل الحصة من رابط Teams", "تجد في صفحة الحصة وصفها ورابطها، وبعد الحصة يصلك تقرير المعلمة في الصفحة نفسها."],
              ].map(([t, d], i) => (
                <li key={t} className="flex gap-5">
                  <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-lav-100 font-display text-lg text-lav-700">
                    {i + 1}
                  </span>
                  <div>
                    <h3 className="text-xl">{t}</h3>
                    <p className="mt-1 text-muted">{d}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="flex justify-center"><SessionCardMock /></div>
        </div>
      </section>

      {/* ---------- After the session: sample report + free first session ---------- */}
      <section aria-labelledby="report-h" className="wrap py-20">
        <div className="grid gap-12 md:grid-cols-[.85fr_1.15fr] md:items-center">
          <div>
            <h2 id="report-h" className="text-3xl md:text-4xl">تعرف ماذا تعلّم ابنك في كل حصة</h2>
            <p className="mt-4 text-muted">
              بعد الحصة تكتب المعلمة تقريراً قصيراً يصلك في صفحة الحصة: ما شرحته، ومستوى الاستيعاب، وما يحتاج إلى دعم، والواجب، وخطة الحصة القادمة.
            </p>
            <div className="mt-8 rounded-2xl border-r-4 border-sky-300 bg-sky-50 p-5">
              <h3 className="text-lg">الحصة الأولى مجانية، وتبدأ بالتشخيص</h3>
              <p className="mt-1 text-[.97rem] text-muted">
                تقيس المعلمة مستوى ابنك في الحصة الأولى، وتكتب في تقريرها خطة مقترحة للأسابيع القادمة، فتعرفون من البداية إلى أين تتجه الحصص.
              </p>
            </div>
          </div>
          <div>
            <SessionReportCard report={SAMPLE_REPORT} title="نموذج لتقرير حصة" meta="رياضيات · الصف الخامس" />
            <p className="mt-3 text-sm text-muted">مثال توضيحي، ويختلف التقرير حسب الحصة والطالب.</p>
          </div>
        </div>
      </section>

      {/* ---------- How teachers are chosen ---------- */}
      <section aria-labelledby="choose-h" className="bg-wash py-20">
        <div className="wrap">
          <h2 id="choose-h" className="max-w-xl text-3xl md:text-4xl">كيف نختار معلماتنا</h2>
          <p className="mt-3 max-w-xl text-muted">لا تظهر أي معلمة لأولياء الأمور قبل أن تمر بهذه المراحل.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {[
              ["مراجعة السيرة الذاتية", "نتحقق من المؤهل والخبرة في المادة والمرحلة الدراسية."],
              ["مقابلة مع المشرفة", `تجري ${s.name} مقابلة تتعرف فيها على أسلوب المعلمة في الشرح والتعامل مع الطلاب.`],
              ["تفعيل بعد الموافقة فقط", "لا يُفتح الحجز مع المعلمة إلا بعد اعتمادها من الإدارة."],
              ["متابعة مستمرة", "نتابع حضور المعلمات وتقارير حصصهن وملاحظات الأهل باستمرار."],
            ].map(([t, d], i) => (
              <li key={t} className="rounded-2xl bg-white p-6">
                <span className="font-display text-2xl text-lav-600">{i + 1}</span>
                <h3 className="mt-2 text-lg">{t}</h3>
                <p className="mt-1 text-[.95rem] text-muted">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------- Pricing ---------- */}
      <section id="pricing" aria-labelledby="pricing-h" className="wrap scroll-mt-24 py-20">
        <h2 id="pricing-h" className="text-3xl md:text-4xl">الباقات</h2>
        <p className="mt-3 max-w-xl text-muted">الأسعار بالريال السعودي، والدفع عبر متجرنا في سلة.</p>

        <div className="mt-10 rounded-2xl border border-line p-6">
          <h3 className="text-xl">أي باقة تناسب ابنك؟</h3>
          <dl className="mt-4 grid gap-5 md:grid-cols-3">
            {[
              ["يحتاج دعماً في أكثر من مادة", "باقة كل المواد", "توزعون الحصص على المواد الثلاث حسب الحاجة، ومعها الحصة الأولى مجاناً."],
              ["مادة واحدة هي التحدي", "باقة مادة واحدة", "تركيز كامل على مادة واحدة طوال الشهر مع معلمتها المختصة."],
              ["اختبار قريب أو درس صعب", "حصة واحدة", "ساعة واحدة دون اشتراك، تحجزونها متى احتجتم."],
            ].map(([when, plan, why]) => (
              <div key={when}>
                <dt className="text-muted">{when}</dt>
                <dd className="mt-1"><span className="font-semibold text-lav-700">{plan}</span> <span className="text-[.95rem] text-muted">— {why}</span></dd>
              </div>
            ))}
          </dl>
        </div>
        {plans.length ? (
          <div className="mt-12 grid items-start gap-6 md:grid-cols-3 md:gap-5">
            {plans.map((p) => <PricingCard key={p.code} plan={p} featured={p.code === "ALL_SUBJECTS"} />)}
          </div>
        ) : (
          <p className="alert alert-info mt-8">يجري تحديث الباقات الآن، يُرجى العودة بعد قليل.</p>
        )}

        <div className="mt-14 grid gap-6 border-t border-line pt-10 md:grid-cols-3">
          <div><h3 className="text-lg">تأجيل الحصة</h3><p className="mt-1 text-[.95rem] text-muted">{POLICY.reschedule}</p></div>
          <div><h3 className="text-lg">تغيير المعلمة</h3><p className="mt-1 text-[.95rem] text-muted">{POLICY.switchTeacher}</p></div>
          <div><h3 className="text-lg">غياب المعلمة</h3><p className="mt-1 text-[.95rem] text-muted">{POLICY.teacherAbsent}</p></div>
        </div>
      </section>

      {/* ---------- Teachers ---------- */}
      <section aria-labelledby="teach-h" className="wrap">
        <div className="grid gap-8 rounded-[26px] bg-sky-100 px-7 py-12 md:grid-cols-[1.3fr_.7fr] md:items-center md:px-14">
          <div>
            <h2 id="teach-h" className="text-3xl">هل أنتِ معلمة وترغبين في التدريس من منزلك؟</h2>
            <p className="mt-3 max-w-xl text-lg">
              حددي الأوقات التي تناسبك، ودرّسي المواد التي تتقنينها، واحصلي على أجرك عن كل حصة تقدمينها. تراجع {s.name} كل طلب انضمام بنفسها.
            </p>
          </div>
          <div className="md:text-left">
            <Link href="/teachers/join" className="btn btn-sky">قدّمي طلب الانضمام</Link>
          </div>
        </div>
      </section>

      {/* ---------- Contact ---------- */}
      <section aria-labelledby="contact-h" className="wrap mt-20">
        <div className="grid gap-6 rounded-[26px] border-[1.5px] border-line px-7 py-10 md:grid-cols-[1fr_auto] md:items-center md:px-14">
          <div>
            <h2 id="contact-h" className="text-3xl">هل لديك سؤال قبل الاشتراك؟</h2>
            <p className="mt-2 text-lg text-muted">اتصل بنا أو راسلنا عبر واتساب، وسنساعدك في اختيار الباقة والمسار المناسبين لابنك.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {site.contact.phones.map((p, i) => (
              <a key={p} href={`https://wa.me/${p}`} target="_blank" rel="noopener noreferrer" className={`btn ${i === 0 ? "btn-sky" : "btn-ghost"}`}>
                واتساب <span dir="ltr">{localPhone(p)}</span>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- FAQ ---------- */}
      <section id="faq" aria-labelledby="faq-h" className="wrap scroll-mt-24 py-20">
        <div className="grid gap-10 md:grid-cols-[.7fr_1.3fr]">
          <h2 id="faq-h" className="text-3xl md:text-4xl">الأسئلة الشائعة</h2>
          <div className="divide-y divide-line border-y border-line">
            {faqFor(plans).map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-medium">
                  {f.q}
                  <span aria-hidden="true" className="text-2xl text-lav-600 transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 max-w-[42rem] text-muted">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
