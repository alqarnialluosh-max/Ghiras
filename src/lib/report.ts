import { z } from "zod";

/** Structured post-session report the teacher may fill (optional). Client-safe: no server imports. */
export const UNDERSTANDING = {
  excellent: "استوعب الدرس بثقة",
  good: "فهم جيد ويحتاج تثبيتاً",
  needs_work: "يحتاج مراجعة وتدريباً إضافياً",
} as const;
export type Understanding = keyof typeof UNDERSTANDING;

export const REPORT_FIELDS = [
  { key: "covered", label: "ما شرحناه اليوم", placeholder: "مثال: جمع الكسور مختلفة المقامات مع أمثلة من الحياة اليومية" },
  { key: "strengths", label: "نقاط القوة", placeholder: "مثال: سريع في توحيد المقامات ويشرح خطواته بوضوح" },
  { key: "struggles", label: "ما يحتاج إلى دعم", placeholder: "مثال: ينسى تبسيط الناتج في النهاية" },
  { key: "homework", label: "الواجب أو التدريب المنزلي", placeholder: "مثال: خمس مسائل من صفحة 42" },
  { key: "next", label: "خطة الحصة القادمة", placeholder: "مثال: طرح الكسور، ثم مسائل لفظية قصيرة" },
] as const;
export type ReportKey = (typeof REPORT_FIELDS)[number]["key"];

export type SessionReport = { understanding?: Understanding } & Partial<Record<ReportKey, string>>;

const text = z.string().trim().max(600).optional().transform((v) => v || undefined);
export const reportSchema = z.object({
  understanding: z.enum(Object.keys(UNDERSTANDING) as [Understanding, ...Understanding[]]).optional().or(z.literal("").transform(() => undefined)),
  covered: text, strengths: text, struggles: text, homework: text, next: text,
});

/** Drop empty keys; null when nothing was written so the column stays empty. */
export function cleanReport(r: z.infer<typeof reportSchema>): SessionReport | null {
  const out = Object.fromEntries(Object.entries(r).filter(([, v]) => v)) as SessionReport;
  return Object.keys(out).length ? out : null;
}

/** Sample shown on the landing page so parents see what they will receive. */
export const SAMPLE_REPORT: SessionReport = {
  understanding: "good",
  covered: "جمع الكسور مختلفة المقامات، مع أمثلة من تقسيم البيتزا والمصروف.",
  strengths: "يوحّد المقامات بسرعة ويشرح خطواته بصوت مسموع.",
  struggles: "ينسى تبسيط الناتج في الخطوة الأخيرة.",
  homework: "خمس مسائل قصيرة مع تبسيط كل ناتج.",
  next: "طرح الكسور، ثم مسائل لفظية من واقع يومه.",
};
