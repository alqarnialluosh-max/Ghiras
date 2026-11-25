"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, requireRole, revokeAllSessions } from "@/lib/auth";
import { adminReschedule, BookingError } from "@/lib/booking";
import { encrypt, makeReference, normalizeSaudiPhone, phoneHash, randomToken } from "@/lib/crypto";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { env } from "@/lib/env";
import { activateSubscription } from "@/lib/subscriptions";
import { postPayoutExpense } from "@/lib/accounting";
import { PAYABLE } from "@/lib/teachers";
import { fail, fieldErrorsOf, keepValues, type ActionState } from "@/lib/validation";

const uuid = z.string().uuid();

export async function setTeacherStatusAction(fd: FormData) {
  const admin = await requireRole("admin");
  const id = uuid.parse(fd.get("id"));
  const op = z.enum(["approve", "suspend", "reactivate"]).parse(fd.get("op"));
  await tx(async (c) => {
    if (op === "approve") {
      await c.query(`UPDATE users SET status = 'active' WHERE id = $1 AND role = 'teacher'`, [id]);
      await c.query(`UPDATE teacher_profiles SET approved_at = COALESCE(approved_at, now()), approved_by = $2 WHERE user_id = $1`, [id, admin.id]);
    } else if (op === "suspend") {
      await c.query(`UPDATE users SET status = 'suspended' WHERE id = $1 AND role = 'teacher'`, [id]);
      await c.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    } else {
      await c.query(`UPDATE users SET status = 'active' WHERE id = $1 AND role = 'teacher'`, [id]);
    }
    await audit(`teacher.${op}`, "user", id, admin.id, {}, c);
  });
  revalidatePath("/admin", "layout");
}

export async function activateSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  const order = z.string().trim().max(60).parse(fd.get("order_id") ?? "");
  const note = z.string().trim().max(300).parse(fd.get("note") ?? "");
  const eventId = fd.get("event_id");
  if (!id.success) return fail("اشتراك غير صحيح.");
  if (!order && !note) return fail("اكتب رقم طلب سلة أو ملاحظة توضح سبب التفعيل.");
  try {
    const ok = await tx(async (c) => {
      if (order) {
        const { rows } = await c.query(`SELECT 1 FROM subscriptions WHERE salla_order_id = $1`, [order]);
        if (rows[0]) throw new Error("ORDER_USED");
      }
      const done = await activateSubscription(c, id.data, { orderId: order || null, actorId: admin.id, note: note || "تفعيل يدوي" });
      if (done && typeof eventId === "string" && uuid.safeParse(eventId).success) {
        await c.query(`UPDATE salla_events SET match_status = 'matched', subscription_id = $2, resolved_by = $3 WHERE id = $1`,
          [eventId, id.data, admin.id]);
      }
      return done;
    });
    if (!ok) return fail("الاشتراك مفعّل مسبقاً أو غير موجود.");
  } catch (e) {
    if ((e as Error).message === "ORDER_USED") return fail("رقم طلب سلة هذا مستخدم في اشتراك آخر.");
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok: "تم تفعيل الاشتراك." };
}

export async function voidSubscriptionAction(fd: FormData) {
  const admin = await requireRole("admin");
  const id = uuid.parse(fd.get("id"));
  // Only unpaid requests can be voided. Paid subscriptions are never cancelled.
  const row = await one(`UPDATE subscriptions SET status = 'void' WHERE id = $1 AND status = 'pending_payment' RETURNING id`, [id]);
  if (row) await audit("subscription.void", "subscription", id, admin.id);
  revalidatePath("/admin", "layout");
}

export async function ignoreEventAction(fd: FormData) {
  const admin = await requireRole("admin");
  const id = uuid.parse(fd.get("id"));
  await q(`UPDATE salla_events SET match_status = 'ignored', resolved_by = $2 WHERE id = $1 AND match_status = 'unmatched'`, [id, admin.id]);
  await audit("salla_event.ignore", "salla_event", id, admin.id);
  revalidatePath("/admin", "layout");
}

export async function setBookingStatusAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  const status = z.enum(["scheduled", "completed", "student_absent", "teacher_absent"]).safeParse(fd.get("status"));
  if (!id.success || !status.success) return fail("بيانات غير صحيحة.");
  const row = await one(`UPDATE bookings SET status = $2 WHERE id = $1 AND status <> 'rescheduled' RETURNING id`, [id.data, status.data]);
  if (!row) return fail("لا يمكن تعديل حالة حصة أعيدت جدولتها.");
  await audit("booking.admin_status", "booking", id.data, admin.id, { status: status.data });
  revalidatePath("/admin", "layout");
  return { ok: "تم تحديث الحالة." };
}

export async function rescheduleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = z.object({
    id: uuid, teacher_id: z.string().uuid("اختر المعلمة"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر التاريخ"),
    time: z.string().regex(/^\d{2}:\d{2}$/, "اختر الوقت"),
    note: z.string().trim().max(300).default(""),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات ناقصة.");
  const [h, m] = parsed.data.time.split(":").map(Number);
  let newId: string;
  try {
    newId = await adminReschedule({ adminId: admin.id, bookingId: parsed.data.id, teacherId: parsed.data.teacher_id,
      dateKey: parsed.data.date, startMinute: h * 60 + m, note: parsed.data.note });
  } catch (e) {
    if (e instanceof BookingError) return fail(e.userMessage);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/bookings/${newId}?rescheduled=1`);
}

export async function recordPayoutAction(fd: FormData) {
  const admin = await requireRole("admin");
  const teacherId = uuid.parse(fd.get("teacher_id"));
  const month = z.string().regex(/^\d{4}-\d{2}$/).parse(fd.get("month"));
  const [y, mo] = month.split("-").map(Number);
  const start = `${month}-01`;
  const end = new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10);
  const rate = env.teacherRateSar;
  await tx(async (c) => {
    const { rows } = await c.query<{ n: string }>(
      `SELECT count(*) n FROM bookings WHERE teacher_id = $1 AND status = ANY($2::booking_status[])
          AND (starts_at AT TIME ZONE 'Asia/Riyadh')::date BETWEEN $3::date AND $4::date`,
      [teacherId, PAYABLE, start, end]);
    const n = Number(rows[0].n);
    if (n === 0) return;
    const { rows: po } = await c.query<{ id: string }>(
      `INSERT INTO payouts (teacher_id, period_start, period_end, sessions_count, rate_sar, amount_sar, paid_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (teacher_id, period_start, period_end) DO NOTHING RETURNING id`,
      [teacherId, start, end, n, rate, n * rate, admin.id]);
    if (po[0]) await postPayoutExpense(c, po[0].id); // accounting: teacher pay expense
    await audit("payout.record", "user", teacherId, admin.id, { month, sessions: n, amount: n * rate }, c);
  });
  revalidatePath("/admin", "layout");
}

export async function updatePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = z.object({
    code: z.string().min(1),
    price_sar: z.coerce.number().min(0).max(100000),
    salla_url: z.string().trim().max(500).refine((v) => v === "" || /^https:\/\//.test(v), "الرابط يبدأ بـ https://"),
    salla_product_id: z.string().trim().max(60),
    active: z.enum(["on"]).optional(),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات غير صحيحة.");
  const d = parsed.data;
  await q(`UPDATE plans SET price_sar = $2, salla_url = NULLIF($3,''), salla_product_id = NULLIF($4,''), active = $5 WHERE code = $1`,
    [d.code, d.price_sar, d.salla_url, d.salla_product_id, d.active === "on"]);
  await audit("plan.update", "plan", d.code, admin.id, { price: d.price_sar, active: d.active === "on" });
  revalidatePath("/", "layout");
  return { ok: "تم حفظ الباقة. السعر الجديد يطبق على الاشتراكات الجديدة فقط." };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return fail("مستخدم غير صحيح.");
  const temp = `Gh${randomToken(9)}7`;
  const row = await one(`UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL WHERE id = $1 AND role <> 'admin' RETURNING id`,
    [id.data, await hashPassword(temp)]);
  if (!row) return fail("لا يمكن إعادة تعيين كلمة مرور هذا الحساب من هنا.");
  await revokeAllSessions(id.data);
  await audit("user.password_reset", "user", id.data, admin.id);
  return { ok: `كلمة المرور المؤقتة: ${temp} — أرسلها للمستخدم بشكل خاص، ولن تظهر مرة ثانية.` };
}

// ---------------------------------------------------------------------------
// Owner: create a client account for critical cases (phone/WhatsApp sign-ups,
// bank transfers, elderly parents...). Optionally attaches an active subscription.
// ---------------------------------------------------------------------------
const createClientSchema = z.object({
  full_name: z.string().trim().min(2, "اكتب اسم ولي الأمر").max(120),
  email: z.string().trim().toLowerCase().email("البريد غير صحيح").max(200),
  phone: z.string().trim().refine((v) => normalizeSaudiPhone(v) !== null, "رقم جوال سعودي غير صحيح"),
  student_name: z.string().trim().min(2, "اكتب اسم الطالب").max(120),
  grade: z.coerce.number().int().min(1, "اختر الصف").max(9, "اختر الصف"),
  notes: z.string().trim().max(1000).optional().default(""),
  plan: z.string().optional().default(""),
  subject: z.enum(["math", "arabic", "science"]).optional(),
  track: z.enum(["remedial", "followup", "exam_prep"]).optional().default("followup"),
  salla_order_id: z.string().trim().max(60).optional().default(""),
  payment_note: z.string().trim().max(300).optional().default(""),
});

export async function createClientAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const values = keepValues(fd);
  const raw = Object.fromEntries(fd);
  if (!raw.subject) delete raw.subject;
  const parsed = createClientSchema.safeParse(raw);
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;

  const plan = d.plan ? await one<{ code: string; price_sar: string; sessions_count: number; bonus_sessions: number;
    weekly_limit: number | null; duration_days: number; all_subjects: boolean }>(`SELECT * FROM plans WHERE code = $1`, [d.plan]) : null;
  if (d.plan && !plan) return fail("الباقة غير موجودة.", undefined, values);
  if (plan && !plan.all_subjects && !d.subject) return fail("اختر المادة للباقة.", { subject: "اختر المادة" }, values);
  if (plan && !d.salla_order_id && !d.payment_note) {
    return fail("اكتب رقم طلب سلة أو ملاحظة الدفع (مثلاً: تحويل بنكي) لتفعيل الاشتراك.", { payment_note: "مطلوب مع الباقة" }, values);
  }

  const temp = `Gh${randomToken(7)}${Math.floor(Math.random() * 90 + 10)}`;
  try {
    const result = await tx(async (c) => {
      if (d.salla_order_id) {
        const { rows } = await c.query(`SELECT 1 FROM subscriptions WHERE salla_order_id = $1`, [d.salla_order_id]);
        if (rows[0]) throw new Error("ORDER_USED");
      }
      const { rows: u } = await c.query<{ id: string }>(
        `INSERT INTO users (role, status, full_name, email, phone_enc, phone_hash, password_hash)
         VALUES ('parent','active',$1,$2,$3,$4,$5) RETURNING id`,
        [d.full_name, d.email, encrypt(normalizeSaudiPhone(d.phone)), phoneHash(d.phone), await hashPassword(temp)],
      );
      const { rows: st } = await c.query<{ id: string }>(
        `INSERT INTO students (parent_id, full_name, grade, notes_enc) VALUES ($1,$2,$3,$4) RETURNING id`,
        [u[0].id, d.student_name, d.grade, encrypt(d.notes)],
      );
      let reference: string | null = null;
      if (plan) {
        const { rows: s } = await c.query<{ id: string; reference: string }>(
          `INSERT INTO subscriptions (reference, parent_id, student_id, plan_code, subject, track, price_sar,
                                      sessions_total, weekly_limit, bonus_sessions, duration_days)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, reference`,
          [makeReference(), u[0].id, st[0].id, plan.code, plan.all_subjects ? null : d.subject, d.track, plan.price_sar,
           plan.sessions_count + plan.bonus_sessions, plan.weekly_limit, plan.bonus_sessions, plan.duration_days],
        );
        await activateSubscription(c, s[0].id, {
          orderId: d.salla_order_id || null, actorId: admin.id, note: d.payment_note || "إنشاء حساب من المالك",
        });
        reference = s[0].reference;
      }
      await audit("admin.create_client", "user", u[0].id, admin.id, { plan: plan?.code ?? null, reference }, c);
      return { reference };
    });
    revalidatePath("/admin", "layout");
    return {
      ok: `تم إنشاء الحساب ✓ — البريد: ${d.email} · كلمة المرور المؤقتة: ${temp}` +
        (result.reference ? ` · الاشتراك ${result.reference} مفعّل الآن` : "") +
        ` — أرسلها للعميل بشكل خاص (لن تظهر مرة ثانية)، ويقدر يغيرها من «حسابي».`,
    };
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً. ابحث عنه في صفحة أولياء الأمور.", { email: "مسجل مسبقاً" }, values);
    if ((e as Error).message === "ORDER_USED") return fail("رقم طلب سلة هذا مستخدم في اشتراك آخر.", undefined, values);
    throw e;
  }
}

// Owner: add a manually-activated subscription to an existing family (critical cases)
export async function addManualSubscriptionAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = z.object({
    student_id: z.string().uuid("اختر الطالب"),
    plan: z.string().min(1, "اختر الباقة"),
    subject: z.enum(["math", "arabic", "science"]).optional(),
    track: z.enum(["remedial", "followup", "exam_prep"]).default("followup"),
    salla_order_id: z.string().trim().max(60).default(""),
    payment_note: z.string().trim().max(300).default(""),
  }).safeParse(Object.fromEntries([...fd.entries()].filter(([, v]) => v !== "")));
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "بيانات ناقصة.");
  const d = parsed.data;
  if (!d.salla_order_id && !d.payment_note) return fail("اكتب رقم طلب سلة أو ملاحظة الدفع.");
  const plan = await one<{ code: string; price_sar: string; sessions_count: number; bonus_sessions: number;
    weekly_limit: number | null; duration_days: number; all_subjects: boolean }>(`SELECT * FROM plans WHERE code = $1`, [d.plan]);
  if (!plan) return fail("الباقة غير موجودة.");
  if (!plan.all_subjects && !d.subject) return fail("اختر المادة.");
  try {
    const ref = await tx(async (c) => {
      const { rows: st } = await c.query<{ parent_id: string }>(`SELECT parent_id FROM students WHERE id = $1`, [d.student_id]);
      if (!st[0]) throw new Error("NO_STUDENT");
      if (d.salla_order_id) {
        const { rows } = await c.query(`SELECT 1 FROM subscriptions WHERE salla_order_id = $1`, [d.salla_order_id]);
        if (rows[0]) throw new Error("ORDER_USED");
      }
      const { rows: s } = await c.query<{ id: string; reference: string }>(
        `INSERT INTO subscriptions (reference, parent_id, student_id, plan_code, subject, track, price_sar,
                                    sessions_total, weekly_limit, bonus_sessions, duration_days)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, reference`,
        [makeReference(), st[0].parent_id, d.student_id, plan.code, plan.all_subjects ? null : d.subject, d.track, plan.price_sar,
         plan.sessions_count + plan.bonus_sessions, plan.weekly_limit, plan.bonus_sessions, plan.duration_days],
      );
      await activateSubscription(c, s[0].id, { orderId: d.salla_order_id || null, actorId: admin.id, note: d.payment_note || "اشتراك يدوي من المالك" });
      return s[0].reference;
    });
    revalidatePath("/admin", "layout");
    return { ok: `تم تفعيل الاشتراك ${ref}.` };
  } catch (e) {
    const m = (e as Error).message;
    if (m === "ORDER_USED") return fail("رقم طلب سلة هذا مستخدم في اشتراك آخر.");
    if (m === "NO_STUDENT") return fail("الطالب غير موجود.");
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------
const entrySchema = z.object({
  kind: z.enum(["income", "expense"], { message: "اختر النوع" }),
  category: z.string().trim().min(2, "اختر التصنيف").max(60),
  custom_category: z.string().trim().max(60).optional().default(""),
  amount_sar: z.coerce.number({ message: "اكتب المبلغ" }).positive("المبلغ لازم يكون أكبر من صفر").max(10_000_000),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "اختر التاريخ"),
  description: z.string().trim().min(2, "اكتب وصفاً مختصراً").max(500),
  salla_order_id: z.string().trim().max(60).optional().default(""),
});

export async function addLedgerEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const values = keepValues(fd);
  const parsed = entrySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;
  const category = d.category === "__custom" ? d.custom_category : d.category;
  if (!category || category.length < 2) return fail("اكتب اسم التصنيف.", { custom_category: "مطلوب" }, values);
  const row = await one<{ id: string }>(
    `INSERT INTO ledger_entries (kind, category, amount_sar, entry_date, description, source, salla_order_id, created_by)
     VALUES ($1,$2,$3,$4,$5,'manual',NULLIF($6,''),$7) RETURNING id`,
    [d.kind, category, d.amount_sar, d.entry_date, d.description, d.salla_order_id, admin.id]);
  await audit("ledger.add", "ledger_entry", row!.id, admin.id, { kind: d.kind, amount: d.amount_sar, category });
  revalidatePath("/admin", "layout");
  return { ok: `تم تسجيل ${d.kind === "income" ? "الإيراد" : "المصروف"}: ${d.amount_sar} ﷼ — ${category}.` };
}

export async function voidLedgerEntryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  const reason = z.string().trim().min(3, "اكتب سبب الإلغاء").max(300).safeParse(fd.get("reason"));
  if (!id.success) return fail("قيد غير صحيح.");
  if (!reason.success) return fail(reason.error.issues[0].message);
  const row = await one(`UPDATE ledger_entries SET voided_at = now(), voided_by = $2, void_reason = $3
                          WHERE id = $1 AND voided_at IS NULL RETURNING id`, [id.data, admin.id, reason.data]);
  if (!row) return fail("القيد ملغى مسبقاً.");
  await audit("ledger.void", "ledger_entry", id.data, admin.id, { reason: reason.data });
  revalidatePath("/admin", "layout");
  return { ok: "تم إلغاء القيد، ويبقى ظاهراً في السجل مع السبب." };
}

export async function updateFeeSettingsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const admin = await requireRole("admin");
  const parsed = z.object({
    salla_fee_percent: z.coerce.number().min(0, "نسبة غير صحيحة").max(20, "نسبة غير صحيحة"),
    salla_fee_fixed_sar: z.coerce.number().min(0).max(100),
  }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  for (const [k, v] of Object.entries(parsed.data)) {
    await q(`INSERT INTO settings (key, value, updated_by) VALUES ($1,$2,$3)
             ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [k, String(v), admin.id]);
  }
  await audit("settings.fees", "settings", null, admin.id, parsed.data);
  revalidatePath("/admin", "layout");
  return { ok: "تم الحفظ. تنطبق على المدفوعات الجديدة من سلة." };
}
