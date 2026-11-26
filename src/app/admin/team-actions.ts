"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { hashPassword, requirePerm, requireRole } from "@/lib/auth";
import { decideApproval, requestApproval, ApprovalError } from "@/lib/approvals";
import { encrypt, normalizeSaudiPhone, phoneHash, randomToken } from "@/lib/crypto";
import { isUniqueViolation, one, q, tx } from "@/lib/db";
import { enqueue, kickOutbox } from "@/lib/email";
import { ALL_PERMISSIONS, STAFF_ROLES, STAFF_ROLE_KEYS, type Permission } from "@/lib/permissions";
import { createTicket, escalateTicket, updateTicket } from "@/lib/tickets";
import { APPROVAL_KIND, SEVERITY, TICKET_CATEGORY, TICKET_STATUS, type ApprovalKind } from "@/lib/ticket-meta";
import { fail, fieldErrorsOf, keepValues, teacherFields, type ActionState } from "@/lib/validation";

const uuid = z.string().uuid();
const tempPassword = () => `Gh${randomToken(9)}7`;
const optionalPhone = z.string().trim().max(20).optional().transform((v) => v || null);

// ------------------------------------------------------------------ team (owner only)

const staffSchema = z.object({
  full_name: z.string().trim().min(2, "اكتب الاسم").max(120),
  email: z.string().trim().toLowerCase().email("بريد غير صحيح"),
  phone: optionalPhone,
  staff_role: z.enum(STAFF_ROLE_KEYS as [string, ...string[]], { message: "اختر الدور" }),
});

function permsFrom(fd: FormData): Permission[] | null {
  if (fd.get("custom") !== "on") return null; // role defaults
  return fd.getAll("perms").map(String).filter((p): p is Permission => (ALL_PERMISSIONS as string[]).includes(p));
}

export async function createStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const owner = await requireRole("admin");
  const values = keepValues(fd);
  const parsed = staffSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;
  const temp = tempPassword();
  try {
    await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (role, status, full_name, email, phone_enc, phone_hash, password_hash, staff_role, permissions, created_by, email_verified_at)
         VALUES ('staff','active',$1,$2,$3,$4,$5,$6,$7,$8, now()) RETURNING id`,
        [d.full_name, d.email, d.phone ? encrypt(normalizeSaudiPhone(d.phone)) : null, d.phone ? phoneHash(d.phone) : null,
         await hashPassword(temp), d.staff_role, permsFrom(fd), owner.id]);
      await audit("staff.create", "user", rows[0].id, owner.id, { staff_role: d.staff_role, custom: fd.get("custom") === "on" }, c);
      await enqueue(c, { userId: rows[0].id, to: d.email, template: "staff_welcome", dedupeKey: `staff_welcome:${rows[0].id}`,
        params: { name: d.full_name.split(" ")[0], role: STAFF_ROLES[d.staff_role as keyof typeof STAFF_ROLES].label } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً.", { email: "البريد مسجل مسبقاً" }, values);
    throw e;
  }
  await kickOutbox();
  revalidatePath("/admin/staff");
  return { ok: `أُضيف ${d.full_name}. كلمة المرور المؤقتة: ${temp} · أرسلها له بشكل خاص، ولن تظهر مرة أخرى.` };
}

export async function updateStaffAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const owner = await requireRole("admin");
  const id = uuid.safeParse(fd.get("id"));
  const role = z.enum(STAFF_ROLE_KEYS as [string, ...string[]]).safeParse(fd.get("staff_role"));
  if (!id.success || !role.success) return fail("بيانات غير صحيحة.");
  const perms = permsFrom(fd);
  const row = await one(`UPDATE users SET staff_role = $2, permissions = $3 WHERE id = $1 AND role = 'staff' RETURNING id`, [id.data, role.data, perms]);
  if (!row) return fail("الحساب غير موجود.");
  await audit("staff.update", "user", id.data, owner.id, { staff_role: role.data, permissions: perms });
  revalidatePath("/admin/staff");
  return { ok: "حُفظت الصلاحيات." };
}

export async function setStaffStatusAction(fd: FormData) {
  const owner = await requireRole("admin");
  const id = uuid.parse(fd.get("id"));
  const op = z.enum(["suspend", "reactivate"]).parse(fd.get("op"));
  await tx(async (c) => {
    await c.query(`UPDATE users SET status = $2 WHERE id = $1 AND role = 'staff'`, [id, op === "suspend" ? "suspended" : "active"]);
    if (op === "suspend") await c.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [id]);
    await audit(`staff.${op}`, "user", id, owner.id, {}, c);
  });
  revalidatePath("/admin/staff");
}

/** The owner (or anyone allowed to manage teachers) adds a teacher directly: approved, no CV upload needed. */
export async function createTeacherAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm("teachers.manage");
  const values = { ...keepValues(fd), subjects: fd.getAll("subjects").map(String).join(",") };
  const schema = teacherFields.omit({ password: true, consent: true });
  const parsed = schema.refine((d) => d.min_grade <= d.max_grade, { path: ["max_grade"], message: "الصف الأعلى يجب أن يكون بعد الصف الأدنى" })
    .safeParse({ ...Object.fromEntries(fd), subjects: fd.getAll("subjects") });
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;
  const temp = tempPassword();
  try {
    await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (role, status, full_name, email, phone_enc, phone_hash, password_hash, created_by, email_verified_at)
         VALUES ('teacher','active',$1,$2,$3,$4,$5,$6, now()) RETURNING id`,
        [d.full_name, d.email, encrypt(normalizeSaudiPhone(d.phone)), phoneHash(d.phone), await hashPassword(temp), actor.id]);
      await c.query(
        `INSERT INTO teacher_profiles (user_id, bio, qualification, years_experience, subjects, min_grade, max_grade, teams_link, approved_at, approved_by)
         VALUES ($1,$2,$3,$4,$5::subject_code[],$6,$7,$8, now(), $9)`,
        [rows[0].id, d.bio, d.qualification, d.years_experience, d.subjects, d.min_grade, d.max_grade, d.teams_link || null, actor.id]);
      await audit("teacher.create_by_admin", "user", rows[0].id, actor.id, {}, c);
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً.", { email: "البريد مسجل مسبقاً" }, values);
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok: `أُضيفت المعلمة ${d.full_name} معتمدة. كلمة المرور المؤقتة: ${temp} · أرسليها لها بشكل خاص. تحدد أوقاتها بعد الدخول.` };
}

// ------------------------------------------------------------------ tickets

const ticketSchema = z.object({
  subject: z.string().trim().min(3, "اكتب عنواناً واضحاً").max(160),
  description: z.string().trim().max(4000).default(""),
  category: z.enum(Object.keys(TICKET_CATEGORY) as [string, ...string[]], { message: "اختر التصنيف" }),
  severity: z.enum(Object.keys(SEVERITY) as [string, ...string[]], { message: "اختر درجة الحرجية" }),
  requester: z.string().trim().max(200).optional(),
});

export async function createTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm("tickets.handle");
  const values = keepValues(fd);
  const parsed = ticketSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const d = parsed.data;
  let requesterId: string | null = null;
  if (d.requester) {
    const u = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND role IN ('parent','teacher')`, [d.requester.toLowerCase()]);
    if (!u) return fail("لم نجد عميلاً أو معلمة بهذا البريد. اتركه فارغاً أو صحّحه.", { requester: "غير موجود" }, values);
    requesterId = u.id;
  }
  const id = await createTicket(actor, { subject: d.subject, description: d.description, category: d.category as never, severity: d.severity as never, requesterId });
  revalidatePath("/admin", "layout");
  redirect(`/admin/tickets/${id}?created=1`);
}

export async function updateTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm("tickets.handle");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return fail("تذكرة غير صالحة.");
  const status = z.enum(Object.keys(TICKET_STATUS) as [string, ...string[]]).optional().safeParse(fd.get("status") || undefined);
  const assign = fd.get("assign");
  const assignTo = assign === "me" ? actor.id : assign && uuid.safeParse(assign).success ? String(assign) : undefined;
  if (assign && assign !== "me" && actor.role !== "admin" && actor.staff_role !== "manager")
    return fail("الإسناد لشخص آخر للمدير أو المالك.");
  try {
    await updateTicket(actor, id.data, { status: status.success ? (status.data as never) : undefined, comment: String(fd.get("comment") ?? ""), assignTo });
  } catch (e) { return fail((e as Error).message); }
  revalidatePath("/admin", "layout");
  redirect(`/admin/tickets/${id.data}?done=saved`);
}

export async function escalateTicketAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm("tickets.handle");
  const id = uuid.safeParse(fd.get("id"));
  const reason = String(fd.get("reason") ?? "").trim();
  if (!id.success) return fail("تذكرة غير صالحة.");
  if (reason.length < 5) return fail("اكتب سبب التصعيد (خمسة أحرف على الأقل).");
  try { await escalateTicket(actor, id.data, reason.slice(0, 1000)); } catch (e) { return fail((e as Error).message); }
  revalidatePath("/admin", "layout");
  redirect(`/admin/tickets/${id.data}?done=escalated`);
}

// ------------------------------------------------------------------ approvals

export async function requestApprovalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm();
  const values = keepValues(fd);
  const kind = z.enum(Object.keys(APPROVAL_KIND) as [string, ...string[]]).safeParse(fd.get("kind"));
  if (!kind.success) return fail("اختر نوع الطلب.", undefined, values);
  const ref = String(fd.get("reference") ?? "").trim().toUpperCase();
  const sub = await one<{ id: string }>(`SELECT id FROM subscriptions WHERE reference = $1`, [ref]);
  if (!sub) return fail("رقم الاشتراك غير صحيح (مثل GH-7K3P9Q).", { reference: "غير موجود" }, values);
  const ticketId = uuid.safeParse(fd.get("ticket_id"));
  try {
    await requestApproval(actor, {
      kind: kind.data as ApprovalKind, subscriptionId: sub.id, reason: String(fd.get("reason") ?? ""),
      sessions: Number(fd.get("sessions") || 1), days: Number(fd.get("days") || 7), ticketId: ticketId.success ? ticketId.data : null,
    });
  } catch (e) {
    if (e instanceof ApprovalError) return fail(e.message, undefined, values);
    throw e;
  }
  revalidatePath("/admin", "layout");
  return { ok: "أُرسل الطلب للاعتماد، وأُبلغ المدير والمالك." };
}

export async function decideApprovalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const actor = await requirePerm("approvals.decide");
  const id = uuid.safeParse(fd.get("id"));
  const decision = z.enum(["approve", "reject"]).safeParse(fd.get("decision"));
  if (!id.success || !decision.success) return fail("طلب غير صالح.");
  const note = String(fd.get("note") ?? "");
  if (decision.data === "reject" && note.trim().length < 3) return fail("اكتب سبب الرفض.");
  try { await decideApproval(actor, id.data, decision.data === "approve", note); }
  catch (e) {
    if (e instanceof ApprovalError) return fail(e.message);
    throw e;
  }
  revalidatePath("/admin", "layout");
  redirect(`/admin/approvals?done=${decision.data === "approve" ? "approved" : "rejected"}`);
}

/** Team members a manager can assign tickets to. */
export async function teamForAssignment() {
  await requirePerm("tickets.handle");
  return q<{ id: string; full_name: string; role: string; staff_role: string | null }>(
    `SELECT id, full_name, role, staff_role FROM users WHERE role IN ('admin','staff') AND status = 'active' AND archived_at IS NULL ORDER BY role, full_name`);
}
