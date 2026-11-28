import { z } from "zod";
import { normalizeSaudiPhoneClientSafe } from "./phone";

export type ActionState = {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

export function fail(error: string, fieldErrors?: Record<string, string>, values?: Record<string, string>): ActionState {
  return { error, fieldErrors, values };
}

/** zod issues → first message per field */
export function fieldErrorsOf(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of err.issues) {
    const k = String(i.path[0] ?? "form");
    out[k] ??= i.message;
  }
  return out;
}

/** Keep non-sensitive values to refill the form after an error. */
export function keepValues(fd: FormData, skip: string[] = ["password", "password2", "current"]) {
  const v: Record<string, string> = {};
  for (const [k, val] of fd.entries()) if (typeof val === "string" && !skip.includes(k)) v[k] = val.slice(0, 2000);
  return v;
}

const name = z.string().trim().min(2, "اكتب الاسم الكامل").max(120, "الاسم طويل جداً");
const email = z.string().trim().toLowerCase().email("البريد الإلكتروني غير صحيح").max(200);
const phone = z.string().trim().refine((v) => normalizeSaudiPhoneClientSafe(v) !== null, "رقم جوال سعودي غير صحيح، مثال: 05XXXXXXXX");
export const password = z
  .string()
  .min(10, "كلمة المرور 10 أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جداً")
  .refine((v) => /[A-Za-z؀-ۿ]/.test(v) && /\d/.test(v), "استخدم حروفاً وأرقاماً معاً");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "اكتب كلمة المرور").max(128),
});

export const parentRegisterSchema = z.object({
  full_name: name,
  email,
  phone,
  password,
  consent: z.literal("on", { message: "الموافقة على سياسة الخصوصية مطلوبة" }),
});

export const teamsLink = z
  .string()
  .trim()
  .max(600)
  .refine((v) => v === "" || /^https:\/\/(teams\.microsoft\.com|teams\.live\.com|meet\.google\.com)\//.test(v),
    "الرابط يكون من Google Meet (https://meet.google.com/…) أو من Teams");

/** Teacher fields without the refinement, so other forms can pick from them. */
export const teacherFields = z.object({
  full_name: name,
  email,
  phone,
  password,
  subjects: z.array(z.enum(["math", "arabic", "science"])).min(1, "اختاري مادة واحدة على الأقل"),
  min_grade: z.coerce.number().int().min(1).max(9),
  max_grade: z.coerce.number().int().min(1).max(9),
  years_experience: z.coerce.number().int().min(0, "رقم غير صحيح").max(60, "رقم غير صحيح"),
  qualification: z.string().trim().min(2, "اكتبي مؤهلك").max(200),
  bio: z.string().trim().min(20, "اكتبي نبذة لا تقل عن 20 حرفاً").max(1500),
  teams_link: teamsLink,
  consent: z.literal("on", { message: "الموافقة على الشروط مطلوبة" }),
});
export const teacherRegisterSchema = teacherFields
  .refine((d) => d.min_grade <= d.max_grade, { path: ["max_grade"], message: "الصف الأعلى يجب أن يكون بعد الصف الأدنى" });

export const studentSchema = z.object({
  full_name: name,
  grade: z.coerce.number().int().min(1, "اختر الصف").max(9, "اختر الصف"),
  notes: z.string().trim().max(1000).optional().default(""),
});

export function safeNext(next: unknown): string | null {
  if (typeof next !== "string") return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return null;
  return next.slice(0, 300);
}
