"use client";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/validation";

export function SubmitButton({ children, pending: pendingLabel, className = "btn btn-primary w-full", ...rest }:
  { children: React.ReactNode; pending?: string; className?: string } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || rest.disabled} aria-busy={pending} {...rest}>
      {pending ? pendingLabel ?? "لحظة..." : children}
    </button>
  );
}

export function FormMessage({ state }: { state: ActionState | undefined }) {
  if (!state) return null;
  if (state.error) return <p role="alert" className="alert alert-error">{state.error}</p>;
  if (state.ok) return <p role="status" className="alert alert-ok">{state.ok}</p>;
  return null;
}

export function Field({
  name, label, state, hint, type = "text", required, autoComplete, defaultValue, placeholder, inputMode, dir, minLength, maxLength,
}: {
  name: string; label: string; state?: ActionState; hint?: string; type?: string; required?: boolean;
  autoComplete?: string; defaultValue?: string; placeholder?: string; dir?: "ltr" | "rtl";
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"]; minLength?: number; maxLength?: number;
}) {
  const err = state?.fieldErrors?.[name];
  const id = `f-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id} name={name} type={type} required={required} autoComplete={autoComplete} placeholder={placeholder}
        inputMode={inputMode} dir={dir} minLength={minLength} maxLength={maxLength}
        defaultValue={state?.values?.[name] ?? defaultValue}
        className="input" aria-invalid={err ? true : undefined} aria-describedby={err ? `${id}-e` : hint ? `${id}-h` : undefined}
      />
      {hint && !err && <p id={`${id}-h`} className="hint">{hint}</p>}
      {err && <p id={`${id}-e`} className="text-sm text-bad">{err}</p>}
    </div>
  );
}

export function FieldErrorText({ state, name }: { state?: ActionState; name: string }) {
  const err = state?.fieldErrors?.[name];
  return err ? <p className="text-sm text-bad">{err}</p> : null;
}
