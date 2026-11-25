import { PAY_TERMS } from "@/lib/teacher-terms";

/** Internal pay terms for approved teachers only. */
export function TeacherPayTerms({ rate }: { rate: number }) {
  return (
    <section className="panel p-6" aria-labelledby="pay-terms">
      <h2 id="pay-terms" className="mb-3 text-lg font-semibold">شروط الأجر (خاصة بك)</h2>
      <ul className="list-disc space-y-2 pr-6 text-[.97rem]">
        <li>أجر الحصة <strong>{rate} ريال</strong> عن كل حصة مكتملة.</li>
        <li>تُستحق الأجرة أيضاً إذا حضرتِ في الموعد وتغيّب الطالب.</li>
        <li>لا تُستحق الأجرة عن الحصص التي تتغيبين عنها أو تتأخرين عنها أكثر من {PAY_TERMS.lateMinutes} دقيقة.</li>
        <li>تُحسب المستحقات شهرياً وتُصرف إلى حسابك البنكي المعتمد لدى الإدارة.</li>
        <li>تكرار الغياب أو التأخير ({PAY_TERMS.repeatAbsences} مرات أو أكثر في الشهر) يستوجب المراجعة.</li>
        <li>هذه الشروط خاصة وسرية بينك وبين غِراس.</li>
      </ul>
    </section>
  );
}
