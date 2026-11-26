"use client";
import { useActionState, useState } from "react";
import { saveSurveyAction, skipSurveyAction } from "./actions";
import { SubmitButton } from "@/components/forms";
import { SURVEY, SURVEY_STEPS, type SurveyKey } from "@/lib/survey";

type Answers = Record<SurveyKey, string[]>;
type Others = Record<SurveyKey, string>;
const OTHER_FIELD: Record<SurveyKey, string> = {
  source: "source_other", goal: "goal_other", needs: "needs_other", expectations: "expectation_other",
};

export function SurveyForm({ name, next, initial }: { name: string; next?: string; initial?: Partial<Answers & { others: Others }> }) {
  const [state, action] = useActionState(saveSurveyAction, {});
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Answers>({
    source: initial?.source ?? [], goal: initial?.goal ?? [], needs: initial?.needs ?? [], expectations: initial?.expectations ?? [],
  });
  const [others, setOthers] = useState<Others>(initial?.others ?? { source: "", goal: "", needs: "", expectations: "" });

  const key = SURVEY_STEPS[step];
  const q = SURVEY[key];
  const picked = answers[key];
  const last = step === SURVEY_STEPS.length - 1;
  const needsOtherText = picked.includes("other") && !others[key].trim();
  const canNext = picked.length > 0 && !needsOtherText;

  const toggle = (value: string) => {
    setAnswers((a) => {
      const cur = a[key];
      if (!q.multi) return { ...a, [key]: [value] };
      return { ...a, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] };
    });
  };

  return (
    <form action={action} className="mx-auto max-w-2xl">
      {next && <input type="hidden" name="next" value={next} />}
      {/* every answer travels in hidden inputs, so the final submit carries all steps */}
      {SURVEY_STEPS.map((k) => (
        <div key={k} hidden>
          {answers[k].map((v) => <input key={v} type="hidden" name={k} value={v} />)}
          <input type="hidden" name={OTHER_FIELD[k]} value={answers[k].includes("other") ? others[k] : ""} />
        </div>
      ))}

      <div className="mb-8 flex items-center gap-3" aria-hidden="true">
        {SURVEY_STEPS.map((k, i) => (
          <span key={k} className={`h-2 flex-1 rounded-full transition-colors ${i <= step ? "bg-lav-400" : "bg-lav-100"}`} />
        ))}
      </div>
      <p className="text-sm text-muted">السؤال {step + 1} من {SURVEY_STEPS.length}</p>

      <fieldset key={key} className="survey-step mt-2">
        <legend className="font-display text-2xl leading-snug md:text-3xl">
          {step === 0 ? `أهلاً ${name}، ` : ""}{q.title}
        </legend>
        <p className="mt-2 text-muted">{q.hint}</p>

        <div className="mt-6 flex flex-wrap gap-3">
          {[...Object.entries(q.options), ["other", "أخرى"] as const].map(([value, labelText]) => {
            const on = picked.includes(value);
            return (
              <button key={value} type="button" onClick={() => toggle(value)} aria-pressed={on}
                className={`min-h-[48px] rounded-2xl border-[1.5px] px-5 py-2.5 text-[1rem] transition-colors ${
                  on ? "border-lav-600 bg-lav-700 text-white" : "border-line bg-white hover:border-lav-400"}`}>
                {on && q.multi && <span aria-hidden="true" className="ml-1">✓</span>}{labelText}
              </button>
            );
          })}
        </div>

        {picked.includes("other") && (
          <div className="field mt-5">
            <label htmlFor={`other-${key}`}>اكتب إجابتك</label>
            <input id={`other-${key}`} className="input" maxLength={200} autoFocus value={others[key]}
              onChange={(e) => setOthers((o) => ({ ...o, [key]: e.target.value }))} />
          </div>
        )}
      </fieldset>

      {state.error && <p role="alert" className="alert alert-error mt-6">{state.error}</p>}

      <div className="mt-10 flex flex-wrap items-center gap-3">
        {step > 0 && <button type="button" className="btn btn-ghost" onClick={() => setStep((s) => s - 1)}>السابق</button>}
        {last ? (
          <SubmitButton className="btn btn-primary" pending="جارٍ الحفظ..." disabled={!canNext}>إنهاء</SubmitButton>
        ) : (
          <button type="button" className="btn btn-primary" disabled={!canNext} onClick={() => setStep((s) => s + 1)}>التالي</button>
        )}
        <button type="submit" formAction={skipSurveyAction} formNoValidate className="mr-auto text-[.95rem] text-muted underline">
          لاحقاً
        </button>
      </div>
    </form>
  );
}
