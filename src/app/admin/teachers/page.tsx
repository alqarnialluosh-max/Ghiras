import Link from "next/link";
import { PageTitle, Empty } from "@/components/DashShell";
import { GRADES, SUBJECTS } from "@/lib/domain";
import { allTeachers } from "@/lib/teachers";
import { shortDate } from "@/lib/time";
import { setTeacherStatusAction } from "../actions";

export const metadata = { title: "المعلمات" };

export default async function AdminTeachers() {
  const teachers = await allTeachers();
  return (
    <>
      <PageTitle title="المعلمات" sub="راجعي الطلبات الجديدة، واعتمدي المعلمة قبل ما تظهر لأولياء الأمور." />
      {teachers.length === 0 ? <Empty title="ما فيه معلمات مسجلات بعد" /> : (
        <div className="space-y-4">
          {teachers.map((t) => (
            <details key={t.user_id} className="panel p-5" open={t.status === "pending"}>
              <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
                <span>
                  <Link href={`/admin/teachers/${t.user_id}`} className="font-semibold text-lav-700 underline">{t.full_name}</Link>
                  <span className="mr-2 text-[.95rem] text-muted">· {t.subjects.map((s) => SUBJECTS[s]).join("، ")}</span>
                </span>
                <span className={`chip ${t.status === "active" ? "chip-ok" : t.status === "pending" ? "chip-warn" : "chip-bad"}`}>
                  {t.status === "active" ? "معتمدة" : t.status === "pending" ? "بانتظار المراجعة" : "موقوفة"}
                </span>
              </summary>
              <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-[1.4fr_.6fr]">
                <div className="space-y-2 text-[.95rem]">
                  <p><span className="text-muted">البريد:</span> <span dir="ltr">{t.email}</span></p>
                  <p><span className="text-muted">المؤهل:</span> {t.qualification} · {t.years_experience} سنوات خبرة</p>
                  <p><span className="text-muted">الصفوف:</span> {GRADES[t.min_grade]} — {GRADES[t.max_grade]}</p>
                  <p><span className="text-muted">السيرة الذاتية:</span> {t.cv_id ? <a href={`/api/documents/${t.cv_id}`} className="text-lav-700 underline">تحميل السيرة الذاتية</a> : <span className="text-bad">بدون سيرة ذاتية</span>}</p>
                  <p><span className="text-muted">Teams:</span> {t.teams_link ? <a href={t.teams_link} target="_blank" rel="noopener noreferrer" className="text-lav-700 underline">فتح الرابط</a> : <span className="text-bad">غير مضاف</span>}</p>
                  <p><span className="text-muted">سجلت:</span> {shortDate(t.created_at)}{t.approved_at ? ` · اعتمدت ${shortDate(t.approved_at)}` : ""}</p>
                  <p className="whitespace-pre-line rounded-xl bg-wash p-3">{t.bio}</p>
                </div>
                <div className="flex flex-col gap-2">
                  {t.status !== "active" && (
                    <form action={setTeacherStatusAction}><input type="hidden" name="id" value={t.user_id} />
                      <input type="hidden" name="op" value={t.status === "pending" ? "approve" : "reactivate"} />
                      <button className="btn btn-primary btn-sm w-full">{t.status === "pending" ? "اعتماد المعلمة" : "إعادة التفعيل"}</button></form>
                  )}
                  {t.status !== "suspended" && (
                    <form action={setTeacherStatusAction}><input type="hidden" name="id" value={t.user_id} />
                      <input type="hidden" name="op" value="suspend" />
                      <button className="btn btn-ghost btn-sm w-full">إيقاف الحساب</button></form>
                  )}
                  <p className="text-xs text-muted">الإيقاف يمنع الدخول والحجوزات الجديدة، والحصص المحجوزة تبقى في السجل.</p>
                </div>
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
