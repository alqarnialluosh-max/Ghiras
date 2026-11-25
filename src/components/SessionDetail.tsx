import { GRADES, SUBJECTS, TRACKS, JOIN_OPENS_MINUTES } from "@/lib/domain";
import type { BookingView } from "@/lib/queries";
import { dateLabel, timeLabel } from "@/lib/time";
import { StatusChip, TeamsButton, joinState } from "./SessionCard";

export function SessionDetail({ b, viewer, studentNotes, children }: {
  b: BookingView; viewer: "parent" | "teacher" | "admin"; studentNotes?: string | null; children?: React.ReactNode;
}) {
  const js = joinState(b);
  return (
    <div className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]">
      <article className="panel p-6 md:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-sky">{SUBJECTS[b.subject]}</span>
          <span className="chip">{TRACKS[b.track].name}</span>
          <StatusChip status={b.status} />
        </div>
        <h1 className="mt-4 text-3xl">{dateLabel(b.starts_at)}</h1>
        <p className="mt-1 text-lg text-muted">{timeLabel(b.starts_at)} — {timeLabel(b.ends_at)} (بتوقيت الرياض)</p>

        <dl className="mt-6 grid gap-4 border-y border-line py-5 sm:grid-cols-2">
          <div><dt className="text-sm text-muted">الطالب</dt><dd className="font-medium">{b.student_name} · {GRADES[b.grade]}</dd></div>
          <div><dt className="text-sm text-muted">المعلمة</dt><dd className="font-medium">{b.teacher_name}</dd></div>
          {viewer !== "parent" && <div><dt className="text-sm text-muted">ولي الأمر</dt><dd className="font-medium">{b.parent_name}</dd></div>}
          <div><dt className="text-sm text-muted">رقم الاشتراك</dt><dd className="font-medium" dir="ltr">{b.reference}</dd></div>
        </dl>

        <section className="mt-6">
          <h2 className="text-lg font-semibold">وصف الحصة</h2>
          <p className="mt-2 whitespace-pre-line rounded-xl bg-wash p-4">{b.description || "ما فيه وصف مضاف — المعلمة تمشي حسب المسار والمنهج."}</p>
        </section>

        {studentNotes && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">ملاحظات ولي الأمر عن الطالب</h2>
            <p className="mt-2 whitespace-pre-line text-muted">{studentNotes}</p>
          </section>
        )}

        {b.teacher_notes && (
          <section className="mt-6">
            <h2 className="text-lg font-semibold">تقرير المعلمة بعد الحصة</h2>
            <p className="mt-2 whitespace-pre-line rounded-xl border-r-4 border-sky-300 bg-sky-50 p-4">{b.teacher_notes}</p>
          </section>
        )}
        {children}
      </article>

      <aside className="panel h-fit p-6">
        <h2 className="text-lg font-semibold">رابط الحصة على Teams</h2>
        {b.status === "scheduled" && js !== "closed" ? (
          <>
            <p className="mt-2 text-[.95rem] text-muted">
              {js === "open" ? "الحصة مفتوحة الآن، ادخل مباشرة." : `الرابط جاهز. يفضّل الدخول قبل الموعد بـ${JOIN_OPENS_MINUTES} دقيقة.`}
            </p>
            <div className="mt-4"><TeamsButton b={b} size="w-full" /></div>
            <p className="mt-4 break-all text-xs text-muted" dir="ltr">{b.teams_link}</p>
          </>
        ) : (
          <p className="mt-2 text-[.95rem] text-muted">انتهى وقت هذه الحصة.</p>
        )}
      </aside>
    </div>
  );
}
