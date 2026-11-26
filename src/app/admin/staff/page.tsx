import { PageTitle } from "@/components/DashShell";
import { requireRole } from "@/lib/auth";
import { q } from "@/lib/db";
import { permissionsOf, roleLabel, type StaffRole } from "@/lib/permissions";
import { shortDate } from "@/lib/time";
import { setStaffStatusAction } from "../team-actions";
import { AddStaffForm, AddTeacherForm, EditStaffForm } from "./TeamForms";

export const metadata = { title: "فريق العمل" };

export default async function StaffPage() {
  await requireRole("admin"); // the owner manages the team
  const team = await q<{ id: string; full_name: string; email: string; role: string; staff_role: StaffRole | null; permissions: string[] | null;
    status: string; created_at: Date; last_login_at: Date | null; open_tickets: string }>(`
    SELECT u.id, u.full_name, u.email, u.role, u.staff_role, u.permissions, u.status, u.created_at, u.last_login_at,
           (SELECT count(*) FROM tickets t WHERE t.assigned_to = u.id AND t.status IN ('open','in_progress','waiting')) open_tickets
      FROM users u WHERE u.role IN ('admin','staff') AND u.archived_at IS NULL ORDER BY u.role, u.created_at`);

  return (
    <>
      <PageTitle title="فريق العمل" sub="أضف المدير ومسؤول التقنية والدعم الفني والمنسقين والمحاسبين، وحدد صلاحيات كل شخص" />

      <section className="mb-10 space-y-3">
        {team.map((m) => (
          <details key={m.id} className="panel p-5">
            <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3">
              <span>
                <span className="font-medium">{m.full_name}</span> <span className="chip chip-lav mr-2">{roleLabel(m)}</span>
                {m.status === "suspended" && <span className="chip chip-bad mr-1">موقوف</span>}
                <span className="block text-sm text-muted" dir="ltr">{m.email}</span>
              </span>
              <span className="text-sm text-muted">
                {m.role === "admin" ? "كل الصلاحيات" : `${permissionsOf(m).length} صلاحية${m.permissions ? " (مخصصة)" : ""}`} ·
                تذاكر مفتوحة {m.open_tickets} · آخر دخول {m.last_login_at ? shortDate(m.last_login_at) : "—"}
              </span>
            </summary>
            {m.role === "staff" && m.staff_role && (
              <div className="mt-4 border-t border-line pt-4">
                <EditStaffForm id={m.id} role={m.staff_role} permissions={m.permissions} />
                <form action={setStaffStatusAction} className="mt-4">
                  <input type="hidden" name="id" value={m.id} />
                  <input type="hidden" name="op" value={m.status === "suspended" ? "reactivate" : "suspend"} />
                  <button className="btn btn-ghost btn-sm">{m.status === "suspended" ? "إعادة تفعيل الحساب" : "إيقاف الحساب"}</button>
                  {m.status !== "suspended" && <span className="mr-3 text-sm text-muted">الإيقاف يسجّل خروجه فوراً، وتبقى أعماله وسجله محفوظة.</span>}
                </form>
              </div>
            )}
          </details>
        ))}
      </section>

      <section className="panel mb-10 p-6">
        <h2 className="mb-4 text-xl">إضافة عضو للفريق</h2>
        <AddStaffForm />
      </section>

      <section className="panel p-6">
        <h2 className="mb-1 text-xl">إضافة معلمة مباشرة</h2>
        <p className="mb-4 text-sm text-muted">لمعلمة أجريتم معها المقابلة: يُنشأ حسابها معتمداً دون طلب انضمام. تُحدد أوقاتها بنفسها بعد الدخول.</p>
        <AddTeacherForm />
      </section>
    </>
  );
}
