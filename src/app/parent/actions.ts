"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { BookingError, createBooking } from "@/lib/booking";
import { encrypt } from "@/lib/crypto";
import { one } from "@/lib/db";
import { getPlans } from "@/lib/plans";
import { rateLimit } from "@/lib/rate-limit";
import { createPendingSubscription } from "@/lib/subscriptions";
import { fail, fieldErrorsOf, keepValues, studentSchema, type ActionState } from "@/lib/validation";

export async function addStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const values = keepValues(fd);
  const parsed = studentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const count = await one<{ n: string }>(`SELECT count(*) n FROM students WHERE parent_id = $1`, [user.id]);
  if (Number(count?.n) >= 10) return fail("بلغت الحد الأعلى لعدد الأبناء في الحساب. تواصل معنا.");
  const row = await one<{ id: string }>(
    `INSERT INTO students (parent_id, full_name, grade, notes_enc) VALUES ($1,$2,$3,$4) RETURNING id`,
    [user.id, parsed.data.full_name, parsed.data.grade, encrypt(parsed.data.notes)],
  );
  await audit("student.create", "student", row!.id, user.id);
  revalidatePath("/parent", "layout");
  const next = fd.get("next");
  if (next === "subscribe") redirect("/parent/subscribe");
  return { ok: `تمت إضافة ${parsed.data.full_name}.` };
}

export async function updateStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const id = z.string().uuid().safeParse(fd.get("id"));
  const parsed = studentSchema.safeParse(Object.fromEntries(fd));
  if (!id.success || !parsed.success) return fail("بيانات غير صحيحة.", parsed.success ? undefined : fieldErrorsOf(parsed.error));
  const row = await one<{ id: string }>(
    `UPDATE students SET full_name = $3, grade = $4, notes_enc = $5 WHERE id = $1 AND parent_id = $2 RETURNING id`,
    [id.data, user.id, parsed.data.full_name, parsed.data.grade, encrypt(parsed.data.notes)],
  );
  if (!row) return fail("الطالب غير موجود.");
  await audit("student.update", "student", id.data, user.id);
  revalidatePath("/parent", "layout");
  return { ok: "تم حفظ التعديل." };
}

const subscribeSchema = z.object({
  plan: z.string().min(1, "اختر الباقة"),
  student_id: z.string().uuid("اختر الطالب"),
  subject: z.enum(["math", "arabic", "science"]).optional(),
  track: z.enum(["remedial", "followup", "exam_prep"], { message: "اختر المسار" }),
});

export async function subscribeAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const values = keepValues(fd);
  const raw = Object.fromEntries(fd);
  if (!raw.subject) delete raw.subject;
  const parsed = subscribeSchema.safeParse(raw);
  if (!parsed.success) return fail("أكمل الاختيارات.", fieldErrorsOf(parsed.error), values);
  if (!(await rateLimit(`subscribe:${user.id}`, 20, 3600))) return fail("طلبات كثيرة، حاول بعد قليل.");

  const plans = await getPlans();
  const plan = plans.find((p) => p.code === parsed.data.plan);
  if (!plan) return fail("الباقة غير متاحة.", undefined, values);
  if (!plan.all_subjects && !parsed.data.subject) return fail("اختر المادة.", { subject: "اختر المادة" }, values);

  try {
    await createPendingSubscription({
      parentId: user.id, studentId: parsed.data.student_id, planCode: plan.code,
      subject: parsed.data.subject ?? null, track: parsed.data.track,
    });
  } catch (e) {
    const m = (e as Error).message;
    if (m === "STUDENT_NOT_FOUND") return fail("الطالب غير موجود.", undefined, values);
    throw e;
  }
  if (!plan.salla_url) {
    return fail("لم يُضف رابط الدفع لهذه الباقة بعد. سجّلنا طلبك وسنتواصل معك، أو حاول لاحقاً.", undefined, values);
  }
  redirect(plan.salla_url);
}

const bookSchema = z.object({
  subscription_id: z.string().uuid(),
  student_id: z.string().uuid(),
  teacher_id: z.string().uuid("اختر المعلمة"),
  subject: z.enum(["math", "arabic", "science"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  minute: z.coerce.number().int().min(0).max(1439),
  description: z.string().trim().max(1000).default(""),
});

export async function bookAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("parent");
  const parsed = bookSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("اختر الوقت والمعلمة أولاً.", fieldErrorsOf(parsed.error));
  if (!(await rateLimit(`book:${user.id}`, 40, 3600))) return fail("طلبات كثيرة، حاول بعد قليل.");
  const d = parsed.data;
  let id: string;
  try {
    id = await createBooking({
      actorId: user.id, parentId: user.id, subscriptionId: d.subscription_id, studentId: d.student_id,
      teacherId: d.teacher_id, subject: d.subject, dateKey: d.date, startMinute: d.minute, description: d.description,
    });
  } catch (e) {
    if (e instanceof BookingError) return fail(e.userMessage);
    throw e;
  }
  revalidatePath("/parent", "layout");
  redirect(`/parent/sessions/${id}?booked=1`);
}
