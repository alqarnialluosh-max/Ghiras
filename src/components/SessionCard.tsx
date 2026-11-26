import Link from "next/link";
import { BOOKING_STATUS, GRADES, JOIN_OPENS_MINUTES, SUBJECTS, TRACKS } from "@/lib/domain";
import type { BookingView } from "@/lib/queries";
import { dateLabel, riyadhDateKey, timeLabel } from "@/lib/time";

export function joinState(b: { starts_at: Date; ends_at: Date; status: string }, now = Date.now()) {
  if (b.status !== "scheduled") return "closed" as const;
  if (now > b.ends_at.getTime()) return "closed" as const;
  if (now >= b.starts_at.getTime() - JOIN_OPENS_MINUTES * 60_000) return "open" as const;
  return "soon" as const;
}

export function StatusChip({ status }: { status: string }) {
  const cls = status === "completed" ? "chip-ok" : status === "scheduled" ? "chip-sky"
    : ["rescheduled", "declined", "not_taken"].includes(status) ? "" : status === "requested" || status === "proposed" ? "chip-lav" : "chip-warn";
  return <span className={`chip ${cls}`}>{BOOKING_STATUS[status] ?? status}</span>;
}

export function TeamsButton({ b, size = "" }: { b: BookingView; size?: string }) {
  const s = joinState(b);
  if (s === "closed") return null;
  if (!b.teams_link) return <span className="text-sm text-muted">يجري تجهيز رابط Teams</span>;
  return (
    <a href={b.teams_link} target="_blank" rel="noopener noreferrer"
      className={`btn ${s === "open" ? "btn-sky" : "btn-ghost"} ${size}`}>
      {s === "open" ? "ادخل الحصة على Teams" : "رابط Teams"}
    </a>
  );
}

export function SessionCard({ b, viewer }: { b: BookingView; viewer: "parent" | "teacher" | "admin" }) {
  const href = viewer === "parent" ? `/parent/sessions/${b.id}` : viewer === "teacher" ? `/teacher/sessions/${b.id}` : `/admin/bookings/${b.id}`;
  const who = viewer === "teacher" ? `${b.student_name} · ${GRADES[b.grade]}` : `مع ${b.teacher_name} · ${b.student_name}`;
  return (
    <article className="panel flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="chip chip-sky">{SUBJECTS[b.subject]}</span>
          <span className="chip">{TRACKS[b.track].short}</span>
          {b.status !== "scheduled" && <StatusChip status={b.status} />}
          {b.report && viewer !== "teacher" && <span className="chip chip-sky">التقرير جاهز</span>}
        </div>
        <p className="mt-2 font-medium">{dateLabel(b.starts_at)} — {timeLabel(b.starts_at)}</p>
        <p className="text-[.95rem] text-muted">{who}</p>
        {b.respond_by && (b.status === "requested" || b.status === "proposed") && (
          <p className="mt-1 text-sm text-lav-700">
            {viewer === "teacher" ? "ردّي قبل " : b.proposal_stage === "parent" ? "أكّد قبل " : "بانتظار الرد حتى "}{timeLabel(b.respond_by)}
            {riyadhDateKey(b.respond_by) !== riyadhDateKey(new Date()) ? ` (${dateLabel(b.respond_by)})` : ""}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <TeamsButton b={b} size="btn-sm" />
        <Link href={href} className="btn btn-ghost btn-sm">التفاصيل</Link>
      </div>
    </article>
  );
}
