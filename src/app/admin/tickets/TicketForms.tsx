"use client";
import { useActionState, useState } from "react";
import { createTicketAction, escalateTicketAction, requestApprovalAction, updateTicketAction } from "../team-actions";
import { Field, FieldErrorText, FormMessage, SubmitButton } from "@/components/forms";
import { APPROVAL_KIND, SEVERITY, TICKET_CATEGORY, TICKET_STATUS, type Severity } from "@/lib/ticket-meta";

export function NewTicketForm({ requester }: { requester?: string }) {
  const [state, action] = useActionState(createTicketAction, {});
  const [sev, setSev] = useState<Severity>((state.values?.severity as Severity) ?? "medium");
  return (
    <form action={action} className="space-y-5" noValidate>
      <FormMessage state={state} />
      <Field name="subject" label="عنوان المشكلة" required state={state} placeholder="مثال: الطالب لا يستطيع دخول اجتماع الحصة" />
      <div className="field">
        <label htmlFor="description">التفاصيل</label>
        <textarea id="description" name="description" className="input" rows={4} maxLength={4000} defaultValue={state.values?.description}
          placeholder="ماذا حدث، ومتى، وما الذي جُرّب" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="category">التصنيف</label>
          <select id="category" name="category" className="input" defaultValue={state.values?.category ?? "teams"}>
            {Object.entries(TICKET_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <Field name="requester" label="بريد العميل أو المعلمة (اختياري)" type="email" dir="ltr" defaultValue={requester} state={state} />
      </div>
      <fieldset>
        <legend className="mb-2 font-medium">درجة الحرجية</legend>
        <div className="grid gap-2 sm:grid-cols-4">
          {(Object.keys(SEVERITY) as Severity[]).map((k) => (
            <label key={k} className={`cursor-pointer rounded-xl border-[1.5px] p-3 text-center ${sev === k ? "border-lav-600 bg-lav-100/60" : "border-line bg-white"}`}>
              <input type="radio" name="severity" value={k} checked={sev === k} onChange={() => setSev(k)} className="sr-only" />
              <span className={`inline-block rounded-full px-2.5 py-0.5 text-sm ${SEVERITY[k].tone}`}>{SEVERITY[k].label}</span>
              <span className="mt-1 block text-xs text-muted">المهلة {SEVERITY[k].hours} {SEVERITY[k].hours === 1 ? "ساعة" : SEVERITY[k].hours <= 10 ? "ساعات" : "ساعة"}</span>
            </label>
          ))}
        </div>
        <FieldErrorText state={state} name="severity" />
        <p className="mt-2 text-sm text-muted">
          {sev === "high" || sev === "critical"
            ? "تُسند فوراً لمسؤول التقنية (للمشكلات التقنية) أو للمدير، ويصله بريد."
            : "تبقى معك في الدعم الفني، وتُصعّد تلقائياً إن تجاوزت مهلتها دون حل."}
        </p>
      </fieldset>
      <SubmitButton className="btn btn-primary" pending="جارٍ الفتح...">فتح التذكرة</SubmitButton>
    </form>
  );
}

export function TicketUpdateForm({ id, status, canAssignOthers, team, mine }: {
  id: string; status: string; canAssignOthers: boolean; team: { id: string; label: string }[]; mine: boolean;
}) {
  const [state, action] = useActionState(updateTicketAction, {});
  return (
    <form action={action} className="space-y-4">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label htmlFor="comment">تحديث أو ملاحظة</label>
        <textarea id="comment" name="comment" className="input" rows={3} maxLength={4000} placeholder="ما الذي تم، وما الخطوة التالية" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field">
          <label htmlFor="status">الحالة</label>
          <select id="status" name="status" className="input" defaultValue={status}>
            {Object.entries(TICKET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {canAssignOthers ? (
          <div className="field">
            <label htmlFor="assign">الإسناد</label>
            <select id="assign" name="assign" className="input" defaultValue="">
              <option value="">بدون تغيير</option>
              {team.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        ) : !mine ? (
          <label className="flex items-center gap-2 self-end pb-3 text-[.95rem]">
            <input type="checkbox" name="assign" value="me" className="accent-lav-700" /> استلام التذكرة
          </label>
        ) : null}
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ...">حفظ</SubmitButton>
    </form>
  );
}

export function EscalateForm({ id, next }: { id: string; next: string }) {
  const [state, action] = useActionState(escalateTicketAction, {});
  return (
    <form action={action} className="space-y-3">
      <FormMessage state={state} />
      <input type="hidden" name="id" value={id} />
      <div className="field">
        <label htmlFor="reason">سبب التصعيد إلى {next}</label>
        <textarea id="reason" name="reason" className="input" rows={2} maxLength={1000} required minLength={5} />
      </div>
      <SubmitButton className="btn btn-ghost" pending="جارٍ التصعيد...">تصعيد</SubmitButton>
    </form>
  );
}

export function ApprovalRequestForm({ ticketId, references }: { ticketId?: string; references?: string[] }) {
  const [state, action] = useActionState(requestApprovalAction, {});
  const [kind, setKind] = useState(state.values?.kind ?? "extra_session");
  return (
    <form action={action} className="space-y-4" noValidate>
      <FormMessage state={state} />
      {ticketId && <input type="hidden" name="ticket_id" value={ticketId} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="field">
          <label htmlFor="kind">نوع الطلب</label>
          <select id="kind" name="kind" className="input" value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(APPROVAL_KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="reference">رقم الاشتراك</label>
          <input id="reference" name="reference" className="input" dir="ltr" list="refs" placeholder="GH-XXXXXX" defaultValue={state.values?.reference ?? references?.[0] ?? ""} />
          {references && <datalist id="refs">{references.map((r) => <option key={r} value={r} />)}</datalist>}
          <FieldErrorText state={state} name="reference" />
        </div>
        {kind === "extra_session" && (
          <div className="field"><label htmlFor="sessions">عدد الحصص</label>
            <select id="sessions" name="sessions" className="input" defaultValue="1">{[1, 2, 3, 4].map((n) => <option key={n}>{n}</option>)}</select></div>
        )}
        {kind === "extend_subscription" && (
          <div className="field"><label htmlFor="days">أيام التمديد</label>
            <select id="days" name="days" className="input" defaultValue="7">{[3, 7, 14, 30].map((n) => <option key={n}>{n}</option>)}</select></div>
        )}
      </div>
      <div className="field">
        <label htmlFor="a-reason">السبب</label>
        <textarea id="a-reason" name="reason" className="input" rows={2} maxLength={1000} placeholder="مثال: انقطع اتصال المعلمة وانتهت الحصة قبل وقتها" />
      </div>
      <SubmitButton className="btn btn-primary" pending="جارٍ الإرسال...">إرسال للاعتماد</SubmitButton>
    </form>
  );
}
