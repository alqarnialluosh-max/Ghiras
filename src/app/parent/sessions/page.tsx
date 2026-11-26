import { Empty, PageTitle } from "@/components/DashShell";
import { SessionCard } from "@/components/SessionCard";
import { ParentRequests } from "@/components/ParentRequests";
import { requireRole } from "@/lib/auth";
import { bookingsFor } from "@/lib/queries";

export const metadata = { title: "الحصص" };

export default async function ParentSessions() {
  const user = await requireRole("parent");
  const [upcoming, past] = await Promise.all([
    bookingsFor("parent", user.id, "upcoming"), bookingsFor("parent", user.id, "past", 200),
  ]);
  return (
    <>
      <PageTitle title="الحصص" sub="كل حصة محفوظة في سجل الطالب مع ملاحظات المعلمة." />
      <ParentRequests parentId={user.id} />
      <section className="mb-10" aria-labelledby="u">
        <h2 id="u" className="mb-3 text-xl">القادمة</h2>
        {upcoming.length ? <div className="space-y-3">{upcoming.map((b) => <SessionCard key={b.id} b={b} viewer="parent" />)}</div>
          : <Empty title="لا توجد حصص قادمة" />}
      </section>
      <section aria-labelledby="p">
        <h2 id="p" className="mb-3 text-xl">السجل</h2>
        {past.length ? <div className="space-y-3">{past.map((b) => <SessionCard key={b.id} b={b} viewer="parent" />)}</div>
          : <Empty title="السجل فارغ حالياً" />}
      </section>
    </>
  );
}
