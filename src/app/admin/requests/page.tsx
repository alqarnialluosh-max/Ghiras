import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { Empty, PageTitle } from "@/components/DashShell";
import { StatusChip } from "@/components/SessionCard";
import { q } from "@/lib/db";
import { SUBJECTS } from "@/lib/domain";
import { dateLabel, dateTimeLabel, timeLabel } from "@/lib/time";
import { reviewDeclineAction } from "../actions";

export const metadata = { title: "طلبات الحجز" };

type R = { id: string; status: string; proposal_stage: string | null; subject: keyof typeof SUBJECTS; starts_at: Date; respond_by: Date | null;
  teacher: string; student: string; parent: string; decline_kind: string | null; decline_reason: string | null; declined_at: Date | null;
  attempt: number; replaced_by: string | null };

const SELECT = `SELECT b.id, b.status, b.proposal_stage, b.subject, b.starts_at, b.respond_by, t.full_name teacher, s.full_name student,
  p.full_name parent, b.decline_kind, b.decline_reason, b.declined_at, b.attempt, b.replaced_by
  FROM bookings b JOIN users t ON t.id = b.teacher_id JOIN students s ON s.id = b.student_id JOIN users p ON p.id = b.parent_id`;

export default async function RequestsPage() {
  await requirePerm("requests.manage");
  const [open, toReview, unplaced, stats] = await Promise.all([
    q<R>(`${SELECT} WHERE b.status IN ('requested','proposed') ORDER BY b.respond_by`),
    q<R>(`${SELECT} WHERE b.decline_kind IN ('teacher','timeout') AND b.decline_reviewed_at IS NULL ORDER BY b.declined_at DESC LIMIT 100`),
    q<R>(`${SELECT} WHERE b.status IN ('declined','not_taken') AND b.replaced_by IS NULL AND b.declined_at > now() - interval '30 days'
          ORDER BY b.declined_at DESC LIMIT 100`),
    q<{ teacher: string; accepted: string; declined: string; timeout: string }>(`
      SELECT t.full_name teacher,
             count(*) FILTER (WHERE b.confirmed_at IS NOT NULL AND b.created_by <> b.teacher_id) accepted,
             count(*) FILTER (WHERE b.decline_kind = 'teacher') declined,
             count(*) FILTER (WHERE b.decline_kind = 'timeout') timeout
        FROM bookings b JOIN users t ON t.id = b.teacher_id
       WHERE b.created_at > now() - interval '30 days' GROUP BY t.full_name
      HAVING count(*) FILTER (WHERE b.decline_kind IN ('teacher','timeout')) > 0 ORDER BY 3 DESC, 4 DESC`),
  ]);
  const who = (r: R) => r.status === "proposed" ? (r.proposal_stage === "parent" ? "ولي الأمر (موعد بديل)" : "المعلمة (موعد بديل)") : "المعلمة";

  return (
    <>
      <PageTitle title="طلبات الحجز" sub="تقبل المعلمة الطلب خلال 3 ساعات، وإلا يتحول تلقائياً لمعلمة أخرى أو لأقرب موعد بديل" />

      <section className="mb-10">
        <h2 className="mb-3 text-xl">بانتظار الرد ({open.length})</h2>
        {open.length === 0 ? <Empty title="لا توجد طلبات معلقة" /> : (
          <div className="panel overflow-x-auto"><table className="table">
            <thead><tr><th>الطالب</th><th>الموعد</th><th>المعلمة</th><th>بانتظار</th><th>المهلة</th></tr></thead>
            <tbody>{open.map((r) => (
              <tr key={r.id}>
                <td><Link href={`/admin/bookings/${r.id}`} className="font-medium text-lav-700 underline">{r.student}</Link>
                  <p className="text-xs text-muted">{SUBJECTS[r.subject]} · {r.parent}</p></td>
                <td className="text-sm">{dateLabel(r.starts_at)}<br />{timeLabel(r.starts_at)}</td>
                <td>{r.teacher}</td>
                <td><StatusChip status={r.status} /><p className="mt-1 text-xs text-muted">{who(r)}</p></td>
                <td className="text-sm">{r.respond_by ? dateTimeLabel(r.respond_by) : "—"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-xl">اعتذارات بانتظار المراجعة ({toReview.length})</h2>
        <p className="mb-3 text-sm text-muted">تحوّلت هذه الطلبات تلقائياً. راجع السبب، ثم علّمها «تمت المراجعة».</p>
        {toReview.length === 0 ? <Empty title="لا توجد اعتذارات جديدة" /> : (
          <div className="space-y-3">{toReview.map((r) => (
            <div key={r.id} className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium">{r.teacher} <span className="text-muted">· {r.decline_kind === "timeout" ? "لم ترد خلال المهلة" : "اعتذرت"}</span></p>
                <p className="text-[.95rem] text-muted">{r.student} · {SUBJECTS[r.subject]} · {dateLabel(r.starts_at)} {timeLabel(r.starts_at)}</p>
                {r.decline_kind === "teacher" && <p className="mt-1">السبب: {r.decline_reason}</p>}
                <p className="mt-1 text-xs text-muted">
                  {r.replaced_by ? "تحوّل الطلب تلقائياً" : "لم يُعثر على بديل، وطُلب من ولي الأمر اختيار موعد"} · {r.declined_at ? dateTimeLabel(r.declined_at) : ""}
                </p>
              </div>
              <form action={reviewDeclineAction}><input type="hidden" name="id" value={r.id} /><button className="btn btn-ghost btn-sm">تمت المراجعة</button></form>
            </div>
          ))}</div>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-1 text-xl">طلبات لم تُحجز (آخر 30 يوماً)</h2>
        <p className="mb-3 text-sm text-muted">طُلب من ولي الأمر اختيار موعد آخر. تابعه إن لم يحجز، حتى لا يضيع.</p>
        {unplaced.length === 0 ? <Empty title="لا توجد" /> : (
          <div className="panel overflow-x-auto"><table className="table">
            <thead><tr><th>ولي الأمر</th><th>الطالب</th><th>الموعد المطلوب</th><th>السبب</th></tr></thead>
            <tbody>{unplaced.map((r) => (
              <tr key={r.id}>
                <td>{r.parent}</td><td>{r.student} · {SUBJECTS[r.subject]}</td>
                <td className="text-sm">{dateLabel(r.starts_at)} {timeLabel(r.starts_at)}</td>
                <td className="text-sm">{r.decline_kind === "parent" ? "رفض الموعد البديل" : r.decline_kind === "parent_timeout" ? "لم يرد على البديل" : "لم يتوفر بديل"}</td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </section>

      {stats.length > 0 && (
        <section>
          <h2 className="mb-3 text-xl">المعلمات والاعتذارات (30 يوماً)</h2>
          <div className="panel overflow-x-auto"><table className="table">
            <thead><tr><th>المعلمة</th><th>قبلت</th><th>اعتذرت</th><th>لم ترد</th></tr></thead>
            <tbody>{stats.map((s) => (
              <tr key={s.teacher}><td>{s.teacher}</td><td>{s.accepted}</td><td>{s.declined}</td><td>{s.timeout}</td></tr>
            ))}</tbody>
          </table></div>
        </section>
      )}
    </>
  );
}
