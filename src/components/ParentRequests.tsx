import Link from "next/link";
import { openRequestsFor, unplacedFor } from "@/lib/queries";
import { SUBJECTS } from "@/lib/domain";
import { dateLabel, timeLabel } from "@/lib/time";
import { SessionCard } from "./SessionCard";

/** Requests that need the parent's attention, then those still being confirmed. */
export async function ParentRequests({ parentId }: { parentId: string }) {
  const [open, unplaced] = await Promise.all([openRequestsFor("parent", parentId), unplacedFor(parentId)]);
  const decide = open.filter((b) => b.status === "proposed" && b.proposal_stage === "parent");
  const waiting = open.filter((b) => !decide.includes(b));
  if (!open.length && !unplaced.length) return null;
  return (
    <div className="mb-10 space-y-6">
      {decide.length > 0 && (
        <section aria-labelledby="decide">
          <h2 id="decide" className="mb-3 text-xl">يحتاج قرارك ({decide.length})</h2>
          <div className="space-y-3">{decide.map((b) => (
            <Link key={b.id} href={`/parent/sessions/${b.id}`} className="panel block border-sky-300 bg-sky-50 p-5 hover:border-sky-500">
              <p className="font-medium">موعد بديل لحصة {SUBJECTS[b.subject]} لـ{b.student_name}: {dateLabel(b.starts_at)} الساعة {timeLabel(b.starts_at)}</p>
              <p className="mt-1 text-[.95rem] text-muted">وافقت {b.teacher_name} على هذا الموعد. اضغط لتأكيده أو اختيار غيره.</p>
            </Link>
          ))}</div>
        </section>
      )}
      {unplaced.length > 0 && (
        <section aria-labelledby="unplaced" className="panel border-amber-200 bg-amber-50 p-5">
          <h2 id="unplaced" className="text-lg font-semibold">اختر موعداً آخر</h2>
          <ul className="mt-2 space-y-1 text-[.95rem]">
            {unplaced.map((b) => <li key={b.id}>{SUBJECTS[b.subject]} لـ{b.student_name}، الموعد المطلوب {dateLabel(b.starts_at)} الساعة {timeLabel(b.starts_at)}</li>)}
          </ul>
          <p className="mt-2 text-[.95rem] text-muted">لم نتمكن من تأكيد هذه المواعيد، وحصصك محفوظة في رصيدك كاملة.</p>
          <Link href="/parent/book" className="btn btn-primary btn-sm mt-3">اختيار موعد</Link>
        </section>
      )}
      {waiting.length > 0 && (
        <section aria-labelledby="waiting">
          <h2 id="waiting" className="mb-3 text-xl">طلبات قيد التأكيد ({waiting.length})</h2>
          <div className="space-y-3">{waiting.map((b) => <SessionCard key={b.id} b={b} viewer="parent" />)}</div>
        </section>
      )}
    </div>
  );
}
