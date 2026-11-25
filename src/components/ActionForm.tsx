"use client";
import { useActionState } from "react";
import type { ActionState } from "@/lib/validation";
import { FormMessage } from "./forms";

/** Generic form for server actions returning ActionState. */
export function ActionForm({ action, children, className = "space-y-3" }: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>; children: React.ReactNode; className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      <FormMessage state={state} />
      {children}
    </form>
  );
}
