import { PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { decrypt } from "@/lib/crypto";
import { GRADES } from "@/lib/domain";
import { studentsOf } from "@/lib/queries";
import { StudentForm } from "./StudentForm";

export const metadata = { title: "أبنائي" };

export default async function StudentsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireRole("parent");
  const { next } = await searchParams;
  const students = await studentsOf(user.id);
  return (
    <>
      <PageTitle title="أبنائي" sub="أضف جميع أبنائك في الحساب نفسه، ولكل منهم اشتراكه وحصصه." />
      <div className="grid gap-8 lg:grid-cols-[1fr_.85fr]">
        <section aria-label="قائمة الأبناء" className="space-y-4">
          {students.length === 0 && <p className="panel p-6 text-muted">لم تُضف أي أبناء بعد.</p>}
          {students.map((s) => (
            <details key={s.id} className="panel group p-5">
              <summary className="flex cursor-pointer list-none items-center justify-between">
                <span>
                  <span className="font-medium">{s.full_name}</span>
                  <span className="mr-2 text-muted">· {GRADES[s.grade]}</span>
                </span>
                <span className="text-sm text-lav-700 group-open:hidden">تعديل</span>
              </summary>
              <div className="mt-5 border-t border-line pt-5">
                <StudentForm student={{ id: s.id, full_name: s.full_name, grade: s.grade, notes: decrypt(s.notes_enc) ?? "" }} />
              </div>
            </details>
          ))}
        </section>
        <section aria-labelledby="add-h" className="panel h-fit p-6">
          <h2 id="add-h" className="mb-4 text-xl">إضافة طالب</h2>
          <StudentForm next={next === "subscribe" ? "subscribe" : undefined} />
        </section>
      </div>
    </>
  );
}
