import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { requireRole } from "@/lib/auth";
import { bookingsFor } from "@/lib/queries";

export const metadata = { title: "حصصي" };

export default async function TeacherSessions() {
  const user = await requireRole("teacher");
  const [upcoming, past] = await Promise.all([bookingsFor("teacher", user.id, "upcoming"), bookingsFor("teacher", user.id, "past", 200)]);
  const needsReport = past.filter((b) => b.status === "scheduled");
  return (
    <>
      <PageTitle title="حصصي" sub="بعد كل حصة: حددي الحضور، ويمكنك إضافة ملاحظات لولي الأمر." />
      {needsReport.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-3 text-xl">تحتاج إلى تحديد الحضور ({needsReport.length})</h2>
          <div className="space-y-3">{needsReport.map((b) => <SessionCard key={b.id} b={b} viewer="teacher" />)}</div>
        </section>
      )}
      <section className="mb-10">
        <h2 className="mb-3 text-xl">القادمة</h2>
        {upcoming.length ? <div className="space-y-3">{upcoming.map((b) => <SessionCard key={b.id} b={b} viewer="teacher" />)}</div>
          : <Empty title="لا توجد حصص قادمة" />}
      </section>
      <section>
        <h2 className="mb-3 text-xl">السجل</h2>
        {past.filter((b) => b.status !== "scheduled").length
          ? <div className="space-y-3">{past.filter((b) => b.status !== "scheduled").map((b) => <SessionCard key={b.id} b={b} viewer="teacher" />)}</div>
          : <Empty title="السجل فارغ حالياً" />}
      </section>
    </>
  );
}
