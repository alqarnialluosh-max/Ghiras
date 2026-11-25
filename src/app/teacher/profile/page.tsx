import { notFound } from "next/navigation";
import { PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { teacherProfile } from "@/lib/teachers";
import { ProfileForm } from "./ProfileForm";
import { CvForm } from "./CvForm";
import { currentCv, fileSize } from "@/lib/documents";
import { shortDate } from "@/lib/time";

export const metadata = { title: "ملفي" };

export default async function TeacherProfilePage() {
  const user = await requireRole("teacher");
  const p = await teacherProfile(user.id);
  if (!p) notFound();
  const cv = await currentCv(user.id);
  return (
    <>
      <PageTitle title="ملفي ورابط Teams" sub={p.approved_at ? "ملفك معتمد ويظهر لأولياء الأمور." : "ملفك قيد المراجعة."} />
      <div className="grid max-w-5xl gap-6 lg:grid-cols-[1.4fr_.6fr]">
        <div className="panel p-6 md:p-8"><ProfileForm p={p} /></div>
        <section className="panel h-fit p-6" aria-labelledby="cv-h">
          <h2 id="cv-h" className="mb-2 text-lg font-semibold">السيرة الذاتية</h2>
          {cv ? (
            <p className="mb-4 text-[.95rem]">
              <a href={`/api/documents/${cv.id}`} className="text-lav-700 underline">{cv.filename}</a>
              <span className="block text-sm text-muted">{fileSize(cv.size_bytes)} · رُفعت {shortDate(cv.created_at)}</span>
            </p>
          ) : <p className="alert alert-error mb-4">ما رفعتي السيرة الذاتية. مطلوبة قبل اعتماد حسابك.</p>}
          <CvForm hasCv={!!cv} />
        </section>
      </div>
    </>
  );
}
