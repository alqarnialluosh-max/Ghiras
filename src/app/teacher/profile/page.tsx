import { notFound } from "next/navigation";
import { PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { teacherProfile } from "@/lib/teachers";
import { ProfileForm } from "./ProfileForm";

export const metadata = { title: "ملفي" };

export default async function TeacherProfilePage() {
  const user = await requireRole("teacher");
  const p = await teacherProfile(user.id);
  if (!p) notFound();
  return (
    <>
      <PageTitle title="ملفي ورابط Teams" sub={p.approved_at ? "ملفك معتمد ويظهر لأولياء الأمور." : "ملفك قيد المراجعة."} />
      <div className="panel max-w-3xl p-6 md:p-8"><ProfileForm p={p} /></div>
    </>
  );
}
