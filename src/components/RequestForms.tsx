"use client";
import { useActionState, useState } from "react";
import { acceptRequestAction, declineRequestAction } from "@/app/teacher/actions";
import { respondProposalAction } from "@/app/parent/actions";
import { FormMessage, SubmitButton } from "./forms";

/** Teacher: accept, or decline with a written reason (shown to the administration). */
export function TeacherRequestForm({ id }: { id: string }) {
  const [acc, accept] = useActionState(acceptRequestAction, {});
  const [dec, decline] = useActionState(declineRequestAction, {});
  const [declining, setDeclining] = useState(false);
  return (
    <div className="mt-4 space-y-4">
      <FormMessage state={acc.error ? acc : dec} />
      {!declining ? (
        <div className="flex flex-wrap gap-3">
          <form action={accept}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton className="btn btn-primary" pending="جارٍ التأكيد...">قبول الحصة</SubmitButton>
          </form>
          <button type="button" className="btn btn-ghost" onClick={() => setDeclining(true)}>اعتذار</button>
        </div>
      ) : (
        <form action={decline} className="space-y-3">
          <input type="hidden" name="id" value={id} />
          <div className="field">
            <label htmlFor="reason">سبب الاعتذار</label>
            <textarea id="reason" name="reason" className="input bg-white" rows={2} required minLength={5} maxLength={500}
              placeholder="مثال: لدي ارتباط طارئ في هذا الوقت" />
            <p className="hint">يصل السبب للإدارة، ويتحول الطلب تلقائياً لمعلمة أخرى أو لموعد بديل.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <SubmitButton className="btn btn-primary" pending="جارٍ الإرسال...">إرسال الاعتذار</SubmitButton>
            <button type="button" className="btn btn-ghost" onClick={() => setDeclining(false)}>رجوع</button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Parent: take the proposed time, or go pick another. */
export function ProposalForm({ id }: { id: string }) {
  // Two forms, each carrying its own answer: the choice never depends on which button the browser reports.
  const [state, action] = useActionState(respondProposalAction, {});
  return (
    <div className="mt-4 space-y-3">
      <FormMessage state={state} />
      <div className="flex flex-wrap gap-3">
        <form action={action}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="answer" value="accept" />
          <SubmitButton className="btn btn-primary" pending="جارٍ التأكيد...">تأكيد هذا الموعد</SubmitButton>
        </form>
        <form action={action}>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="answer" value="decline" />
          <SubmitButton className="btn btn-ghost" pending="لحظة...">لا يناسبني، سأختار موعداً آخر</SubmitButton>
        </form>
      </div>
    </div>
  );
}
