"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, requireRole, revokeAllSessions } from "@/lib/auth";
import { adminReschedule, BookingError } from "@/lib/booking";
import { randomToken } from "@/lib/crypto";
import { one, q, tx } from "@/lib/db";
import { env } from "@/lib/env";
import { activateSubscription } from "@/lib/subscriptions";
import { PAYABLE } from "@/lib/teachers";
import { fail, type ActionState } from "@/lib/validation";

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
  revalidatePath("/admin/payments");
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
    await c.query(
      `INSERT INTO payouts (teacher_id, period_start, period_end, sessions_count, rate_sar, amount_sar, paid_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (teacher_id, period_start, period_end) DO NOTHING`,
      [teacherId, start, end, n, rate, n * rate, admin.id]);
    await audit("payout.record", "user", teacherId, admin.id, { month, sessions: n, amount: n * rate }, c);
  });
  revalidatePath("/admin/payouts");
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
