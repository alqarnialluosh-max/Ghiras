import { PAY_TERMS } from "@/lib/teacher-terms";

/** Internal pay terms for approved teachers only. */
export function TeacherPayTerms({ rates }: { rates: { name_ar: string; teacher_rate_sar: string }[] }) {
  return (
    <section className="panel p-6" aria-labelledby="pay-terms">
      <h2 id="pay-terms" className="mb-3 text-lg font-semibold">شروط الأجر (خاصة بك)</h2>
      <ul className="list-disc space-y-2 pr-6 text-[.97rem]">
        <li>أجر الحصة المكتملة حسب نوع اشتراك الطالب:
          <ul className="mt-1 list-none space-y-0.5 pr-2">
            {rates.map((r) => <li key={r.name_ar}>{r.name_ar}: <strong>{Number(r.teacher_rate_sar)} ريال</strong></li>)}
          </ul>
        </li>
        <li>قد تُضاف مكافآت تقديرية، وتظهر في جدول المستحقات وتُصرف مع أجر شهرها.</li>
        <li>تُستحق الأجرة أيضاً إذا حضرتِ في الموعد وتغيّب الطالب.</li>
        <li>لا تُستحق الأجرة عن الحصص التي تتغيبين عنها أو تتأخرين عنها أكثر من {PAY_TERMS.lateMinutes} دقيقة.</li>
        <li>تُحسب المستحقات شهرياً وتُصرف إلى حسابك البنكي المعتمد لدى الإدارة.</li>
        <li>تكرار الغياب أو التأخير ({PAY_TERMS.repeatAbsences} مرات أو أكثر في الشهر) يستوجب المراجعة.</li>
        <li>هذه الشروط خاصة وسرية بينك وبين غِراس.</li>
      </ul>
    </section>
  );
}
