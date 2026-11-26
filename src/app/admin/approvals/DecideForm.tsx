"use client";
import { useActionState } from "react";
import { decideApprovalAction } from "../team-actions";
import { FormMessage, SubmitButton } from "@/components/forms";

export function DecideForm({ id }: { id: string }) {
  const [state, action] = useActionState(decideApprovalAction, {});
  return (
    <div className="mt-3 space-y-2">
      <FormMessage state={state} />
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="approve" />
        <input name="note" className="input min-w-[200px] flex-1" placeholder="ملاحظة (اختيارية)" maxLength={1000} />
        <SubmitButton className="btn btn-primary btn-sm" pending="جارٍ التنفيذ...">اعتماد وتنفيذ</SubmitButton>
      </form>
      <form action={action} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="reject" />
        <input name="note" className="input min-w-[200px] flex-1" placeholder="سبب الرفض" maxLength={1000} required minLength={3} />
        <SubmitButton className="btn btn-ghost btn-sm" pending="لحظة...">رفض</SubmitButton>
      </form>
    </div>
  );
}
