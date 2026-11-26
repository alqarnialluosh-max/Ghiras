"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { cleanReport, reportSchema } from "@/lib/report";
import { kickOutbox, queueReportEmail } from "@/lib/email";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth";
import { one, pool, q, tx } from "@/lib/db";
import { checkCv, saveCv } from "@/lib/documents";
import { riyadhToUtc, addDaysKey } from "@/lib/time";
import { fail, fieldErrorsOf, keepValues, teamsLink, type ActionState } from "@/lib/validation";

const profileSchema = z.object({
  bio: z.string().trim().min(20, "اكتبي نبذة لا تقل عن 20 حرفاً").max(1500),
  qualification: z.string().trim().min(2, "اكتبي مؤهلك").max(200),
  years_experience: z.coerce.number().int().min(0).max(60),
  subjects: z.array(z.enum(["math", "arabic", "science"])).min(1, "اختاري مادة واحدة على الأقل"),
  min_grade: z.coerce.number().int().min(1).max(9),
  max_grade: z.coerce.number().int().min(1).max(9),
  teams_link: teamsLink,
  accepting: z.enum(["on"]).optional(),
}).refine((d) => d.min_grade <= d.max_grade, { path: ["max_grade"], message: "الصف الأعلى يجب أن يكون بعد الأدنى" });

export async function updateProfileAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const values = keepValues(fd);
  const parsed = profileSchema.safeParse({ ...Object.fromEntries(fd), subjects: fd.getAll("subjects") });
  if (!parsed.success) return fail("راجعي الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;
  await q(
    `UPDATE teacher_profiles SET bio=$2, qualification=$3, years_experience=$4, subjects=$5::subject_code[],
            min_grade=$6, max_grade=$7, teams_link=$8, accepting=$9 WHERE user_id=$1`,
    [user.id, d.bio, d.qualification, d.years_experience, d.subjects, d.min_grade, d.max_grade, d.teams_link || null, d.accepting === "on"],
  );
  await audit("teacher.profile_update", "user", user.id, user.id);
  revalidatePath("/teacher", "layout");
  return { ok: "تم حفظ ملفك. تأخذ الحصص الجديدة رابط Teams المحدّث، وتبقى الحصص المحجوزة على رابطها." };
}

const time = z.string().regex(/^\d{2}:\d{2}$/, "وقت غير صحيح").transform((v) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
});

const ruleSchema = z.object({
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).min(1, "اختاري يوماً واحداً على الأقل"),
  start: time,
  end: time,
}).refine((d) => d.end - d.start >= 60, { path: ["end"], message: "الفترة ساعة على الأقل" })
  .refine((d) => d.start % 30 === 0 && d.end % 30 === 0, { path: ["start"], message: "استخدمي أوقاتاً على رأس الساعة أو النصف" });

export async function addAvailabilityAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = ruleSchema.safeParse({ weekdays: fd.getAll("weekdays"), start: fd.get("start"), end: fd.get("end") });
  if (!parsed.success) return fail("راجعي الأوقات.", fieldErrorsOf(parsed.error), keepValues(fd));
  const { weekdays, start, end } = parsed.data;
  const overlap = await one(
    `SELECT 1 FROM availability_rules WHERE teacher_id = $1 AND active AND weekday = ANY($2::smallint[])
        AND start_minute < $4 AND end_minute > $3 LIMIT 1`,
    [user.id, weekdays, start, end],
  );
  if (overlap) return fail("هذه الفترة تتداخل مع فترة موجودة في أحد الأيام المختارة.");
  for (const w of weekdays) {
    await q(`INSERT INTO availability_rules (teacher_id, weekday, start_minute, end_minute) VALUES ($1,$2,$3,$4)`, [user.id, w, start, end]);
  }
  await audit("availability.add", "user", user.id, user.id, { weekdays, start, end });
  revalidatePath("/teacher/availability");
  return { ok: "تمت إضافة الفترة." };
}

export async function deactivateAvailabilityAction(fd: FormData) {
  const user = await requireRole("teacher");
  const id = z.string().uuid().parse(fd.get("id"));
  await q(`UPDATE availability_rules SET active = false WHERE id = $1 AND teacher_id = $2`, [id, user.id]);
  await audit("availability.deactivate", "availability_rule", id, user.id);
  revalidatePath("/teacher/availability");
}

const offSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختاري تاريخ البداية"),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختاري تاريخ النهاية"),
  reason: z.string().trim().max(200).optional().default(""),
}).refine((d) => d.to >= d.from, { path: ["to"], message: "تاريخ النهاية قبل البداية" });

export async function addTimeOffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = offSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجعي التواريخ.", fieldErrorsOf(parsed.error), keepValues(fd));
  const s = riyadhToUtc(parsed.data.from, 0);
  const e = riyadhToUtc(addDaysKey(parsed.data.to, 1), 0);
  if (e.getTime() < Date.now()) return fail("الفترة في الماضي.");
  const clash = await one<{ n: string }>(
    `SELECT count(*) n FROM bookings WHERE teacher_id = $1 AND status = 'scheduled' AND starts_at < $3 AND ends_at > $2`,
    [user.id, s, e],
  );
  if (Number(clash?.n) > 0) {
    return fail(`لديك ${clash!.n} حصص محجوزة في هذه الفترة. تواصلي مع الإدارة لإعادة جدولتها أولاً.`);
  }
  await q(`INSERT INTO availability_exceptions (teacher_id, during, reason) VALUES ($1, tstzrange($2,$3,'[)'), $4)`,
    [user.id, s, e, parsed.data.reason]);
  await audit("timeoff.add", "user", user.id, user.id, { from: parsed.data.from, to: parsed.data.to });
  revalidatePath("/teacher/availability");
  return { ok: "تم تسجيل الإجازة، ولن تظهر أوقاتك خلالها للحجز." };
}

export async function deactivateTimeOffAction(fd: FormData) {
  const user = await requireRole("teacher");
  const id = z.string().uuid().parse(fd.get("id"));
  await q(`UPDATE availability_exceptions SET active = false WHERE id = $1 AND teacher_id = $2`, [id, user.id]);
  await audit("timeoff.deactivate", "availability_exception", id, user.id);
  revalidatePath("/teacher/availability");
}

const sessionSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["scheduled", "completed", "student_absent"]),
  teacher_notes: z.string().trim().max(2000).default(""),
}).merge(reportSchema);

export async function updateSessionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const parsed = sessionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("بيانات غير صحيحة.");
  const d = parsed.data;
  const b = await one<{ status: string; starts_at: Date }>(
    `SELECT status, starts_at FROM bookings WHERE id = $1 AND teacher_id = $2`, [d.id, user.id]);
  if (!b) return fail("الحصة غير موجودة.");
  if (!["scheduled", "completed", "student_absent"].includes(b.status)) return fail("حالة هذه الحصة تديرها الإدارة.");
  if (d.status !== "scheduled" && b.starts_at.getTime() > Date.now()) return fail("يمكنك تحديد الحضور بعد بداية الحصة.");
  // a report only makes sense for a session that happened
  const report = d.status === "completed" ? cleanReport(d) : null;
  await q(`UPDATE bookings SET status = $3, teacher_notes = $4, report = $5 WHERE id = $1 AND teacher_id = $2`,
    [d.id, user.id, d.status, d.teacher_notes || null, report]);
  // the full report goes to the append-only audit log, so earlier versions are never lost
  await audit("booking.teacher_update", "booking", d.id, user.id, { from: b.status, to: d.status, report });
  if (report) { await queueReportEmail(pool, d.id); await kickOutbox(); } // once per session (dedupe), later edits don't re-send
  revalidatePath("/teacher", "layout");
  revalidatePath("/parent", "layout");
  return { ok: report ? "تم الحفظ، ووصل التقرير لولي الأمر." : "تم الحفظ، وتظهر ملاحظاتك لولي الأمر." };
}

export async function replaceCvAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await requireRole("teacher");
  const cv = await checkCv(fd.get("cv"));
  if (!cv.ok) return fail(cv.error);
  await tx(async (c) => {
    await saveCv(c, user.id, cv, user.id);
    await audit("teacher.cv_upload", "user", user.id, user.id, { filename: cv.filename, size: cv.buf.length }, c);
  });
  revalidatePath("/teacher/profile");
  return { ok: "تم رفع السيرة الذاتية. النسخة القديمة محفوظة في السجل." };
}
