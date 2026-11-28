import Link from "next/link";
import type { BookingView } from "@/lib/queries";
import { dateLabel, timeLabel } from "@/lib/time";

const deadline = (d: Date | null) => (d ? `${dateLabel(d)} الساعة ${timeLabel(d)}` : "");

/** Explains where a request stands, for the parent or the teacher. Forms are passed as children. */
export function RequestPanel({ b, viewer, children }: { b: BookingView; viewer: "parent" | "teacher"; children?: React.ReactNode }) {
  let title = "", body = "", tone = "border-lav-400 bg-lav-100/50";
  const atTeacher = b.status === "requested" || (b.status === "proposed" && b.proposal_stage === "teacher");

  if (viewer === "teacher") {
    if (atTeacher) {
      title = b.status === "requested" ? "طلب حصة بانتظار ردكِ" : "اقتراح موعد بديل بانتظار موافقتكِ";
      body = b.status === "requested"
        ? `يُرجى القبول أو الاعتذار قبل ${deadline(b.respond_by)}، وإلا يتحول الطلب تلقائياً لمعلمة أخرى.`
        : `الموعد الذي طلبته الأسرة لم يعد متاحاً، وهذا أقرب موعد في جدولكِ. إذا وافقتِ نعرضه على ولي الأمر. الرد قبل ${deadline(b.respond_by)}.`;
    } else if (b.status === "proposed") {
      title = "بانتظار موافقة ولي الأمر"; body = "وافقتِ على هذا الموعد، ونرسل لكِ التأكيد فور موافقة ولي الأمر.";
    } else if (b.status === "declined") {
      tone = "border-line bg-wash";
      title = b.decline_kind === "timeout" ? "انتهت مهلة الرد على هذا الطلب" : "اعتذرتِ عن هذا الطلب";
      body = b.decline_kind === "timeout" ? "تحوّل الطلب تلقائياً، ولا يلزمكِ أي إجراء." : `السبب: ${b.decline_reason ?? ""}`;
    } else if (b.status === "not_taken") {
      tone = "border-line bg-wash"; title = "لم تُحجز هذه الحصة"; body = "اختار ولي الأمر موعداً آخر.";
    } else return null;
  } else {
    if (b.status === "requested") {
      title = `بانتظار تأكيد ${b.teacher_name}`;
      body = `تؤكد المعلمة قبل ${deadline(b.respond_by)}، ونرسل لك رابط الحصة فور التأكيد. لن تُخصم الحصة من رصيدك قبل التأكيد، وإذا تعذّر الموعد نحوّل الطلب أو نقترح عليك أقرب بديل.`;
    } else if (b.status === "proposed" && b.proposal_stage === "teacher") {
      title = "نجهّز لك موعداً بديلاً";
      body = "الموعد الذي طلبته لم يعد متاحاً، فاخترنا أقرب موعد ونتأكد الآن من المعلمة. سنرسل لك الاقتراح خلال ساعات قليلة.";
    } else if (b.status === "proposed") {
      tone = "border-sky-300 bg-sky-50";
      title = "هل يناسبك هذا الموعد البديل؟";
      body = `الموعد الذي طلبته لم يعد متاحاً، ووافقت ${b.teacher_name} على أقرب موعد: ${dateLabel(b.starts_at)} الساعة ${timeLabel(b.starts_at)}. أكّد قبل ${deadline(b.respond_by)}.`;
    } else if ((b.status === "declined" || b.status === "not_taken") && !b.replaced_by) {
      tone = "border-amber-200 bg-amber-50";
      title = "اختر موعداً يناسبك";
      body = "لم يُحجز هذا الموعد، وحصتك محفوظة في رصيدك كاملة. اختر اليوم والوقت المناسبين لك.";
      children = <Link href="/parent/book" className="btn btn-primary mt-4">اختيار موعد</Link>;
    } else return null;
  }

  return (
    <section aria-label="حالة الطلب" className={`mb-6 rounded-2xl border-r-4 p-5 ${tone}`}>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-[.97rem] text-ink/80">{body}</p>
      {children}
    </section>
  );
}
