"use server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { consumeToken, dispatchOutbox, emailConfigured, enqueueAdmin, enqueueForUser, sendTokenEmail } from "@/lib/email";
import { SUBJECTS } from "@/lib/domain";
import { one, tx, isUniqueViolation } from "@/lib/db";
import { audit } from "@/lib/audit";
import {
  burnPasswordTime, createSession, destroySession, getSessionUser, hashPassword, homeFor, verifyPassword, type Role,
} from "@/lib/auth";
import { encrypt, phoneHash, normalizeSaudiPhone } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { checkCv, saveCv } from "@/lib/documents";
import { ipHash } from "@/lib/request";
import {
  fail, fieldErrorsOf, keepValues, loginSchema, parentRegisterSchema, password, safeNext, teacherRegisterSchema, type ActionState,
} from "@/lib/validation";

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = keepValues(fd);
  const parsed = loginSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const { email, password } = parsed.data;

  const ip = await ipHash();
  if (!(await rateLimit(`login:ip:${ip}`, 30, 600)) || !(await rateLimit(`login:email:${email}`, 10, 900))) {
    return fail("محاولات كثيرة. انتظر ربع ساعة ثم حاول مرة أخرى.", undefined, values);
  }

  const user = await one<{ id: string; role: Role; password_hash: string; failed_logins: number; locked_until: Date | null; status: string }>(
    `SELECT id, role, password_hash, failed_logins, locked_until, status FROM users WHERE email = $1 AND archived_at IS NULL`,
    [email],
  );
  if (!user) {
    await burnPasswordTime(password);
    return fail("البريد أو كلمة المرور غير صحيحة.", undefined, values);
  }
  if (user.locked_until && user.locked_until > new Date()) {
    return fail("الحساب مقفل مؤقتاً بسبب محاولات خاطئة متكررة. حاول بعد ربع ساعة.", undefined, values);
  }
  if (user.status === "suspended") return fail("هذا الحساب موقوف. تواصل مع الإدارة.", undefined, values);

  if (!(await verifyPassword(user.password_hash, password))) {
    const failed = user.failed_logins + 1;
    if (failed >= MAX_FAILED) {
      await one(`UPDATE users SET failed_logins = 0, locked_until = now() + make_interval(mins => $2) WHERE id = $1`, [user.id, LOCK_MINUTES]);
      await audit("auth.locked", "user", user.id, null);
    } else {
      await one(`UPDATE users SET failed_logins = $2 WHERE id = $1`, [user.id, failed]);
    }
    return fail("البريد أو كلمة المرور غير صحيحة.", undefined, values);
  }

  await createSession(user.id);
  await audit("auth.login", "user", user.id, user.id);
  redirect(safeNext(fd.get("next")) ?? homeFor(user.role));
}

export async function registerParentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = keepValues(fd);
  const parsed = parentRegisterSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  if (!(await rateLimit(`register:ip:${await ipHash()}`, 8, 3600))) {
    return fail("تم إنشاء حسابات كثيرة من هذا الجهاز. حاول لاحقاً.", undefined, values);
  }
  const d = parsed.data;
  const pw = await hashPassword(d.password);
  let userId: string;
  try {
    const row = await one<{ id: string }>(
      `INSERT INTO users (role, status, full_name, email, phone_enc, phone_hash, password_hash)
       VALUES ('parent','active',$1,$2,$3,$4,$5) RETURNING id`,
      [d.full_name, d.email, encrypt(normalizeSaudiPhone(d.phone)), phoneHash(d.phone), pw],
    );
    userId = row!.id;
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً. سجّل الدخول بدلاً من ذلك.", { email: "البريد مسجل مسبقاً" }, values);
    throw e;
  }
  await audit("user.register", "user", userId, userId, { role: "parent" });
  await createSession(userId);
  if (emailConfigured()) after(() => sendTokenEmail(userId, "verify").catch(() => undefined));
  const next = safeNext(fd.get("next"));
  redirect(`/parent/welcome${next ? `?next=${encodeURIComponent(next)}` : ""}`);
}

export async function registerTeacherAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = { ...keepValues(fd), subjects: fd.getAll("subjects").map(String).join(",") };
  const raw = { ...Object.fromEntries(fd), subjects: fd.getAll("subjects") };
  const parsed = teacherRegisterSchema.safeParse(raw);
  if (!parsed.success) return fail("راجعي الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  if (!(await rateLimit(`register:ip:${await ipHash()}`, 8, 3600))) {
    return fail("تم إنشاء حسابات كثيرة من هذا الجهاز. حاولي لاحقاً.", undefined, values);
  }
  const cv = await checkCv(fd.get("cv"));
  if (!cv.ok) return fail("أرفقي السيرة الذاتية.", { cv: cv.error }, values);
  const d = parsed.data;
  const pw = await hashPassword(d.password);
  let userId: string;
  try {
    userId = await tx(async (c) => {
      const { rows } = await c.query<{ id: string }>(
        `INSERT INTO users (role, status, full_name, email, phone_enc, phone_hash, password_hash)
         VALUES ('teacher','pending',$1,$2,$3,$4,$5) RETURNING id`,
        [d.full_name, d.email, encrypt(normalizeSaudiPhone(d.phone)), phoneHash(d.phone), pw],
      );
      await c.query(
        `INSERT INTO teacher_profiles (user_id, bio, qualification, years_experience, subjects, min_grade, max_grade, teams_link)
         VALUES ($1,$2,$3,$4,$5::subject_code[],$6,$7,$8)`,
        [rows[0].id, d.bio, d.qualification, d.years_experience, d.subjects, d.min_grade, d.max_grade, d.teams_link || null],
      );
      await saveCv(c, rows[0].id, cv, rows[0].id);
      await enqueueForUser(c, rows[0].id, "teacher_received", {}, `teacher_received:${rows[0].id}`);
      await enqueueAdmin(c, "admin_new_teacher",
        { name: d.full_name, subjects: d.subjects.map((s) => SUBJECTS[s]).join("، "), teacher: rows[0].id }, `admin_new_teacher:${rows[0].id}`);
      return rows[0].id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً.", { email: "البريد مسجل مسبقاً" }, values);
    throw e;
  }
  await audit("user.register", "user", userId, userId, { role: "teacher" });
  await createSession(userId);
  after(async () => {
    if (emailConfigured()) await sendTokenEmail(userId, "verify").catch(() => undefined);
    await dispatchOutbox().catch(() => undefined);
  });
  redirect("/teacher");
}

export async function logoutAction() {
  const u = await getSessionUser();
  await destroySession();
  if (u) await audit("auth.logout", "user", u.id, u.id);
  redirect("/");
}

// ------------------------------------------------------------------ email: verification + password reset

const SENT_GENERIC = "إذا كان البريد مسجلاً لدينا فستصلك رسالة خلال دقائق. تحقق من صندوق الوارد والرسائل غير المرغوب فيها.";

export async function forgotPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const values = keepValues(fd);
  const parsed = z.object({ email: z.string().trim().toLowerCase().email("اكتب بريداً صحيحاً") }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error), values);
  const { email } = parsed.data;
  if (!(await rateLimit(`forgot:ip:${await ipHash()}`, 10, 3600)) || !(await rateLimit(`forgot:email:${email}`, 3, 3600))) {
    return fail("طلبات كثيرة. حاول بعد ساعة.", undefined, values);
  }
  if (!emailConfigured()) return fail("استعادة كلمة المرور بالبريد غير متاحة حالياً. راسلنا على واتساب لإعادة تعيينها.", undefined, values);
  const user = await one<{ id: string }>(`SELECT id FROM users WHERE email = $1 AND archived_at IS NULL AND status <> 'suspended'`, [email]);
  if (user) {
    await sendTokenEmail(user.id, "reset");
    await audit("auth.reset_requested", "user", user.id, null);
  }
  // Same answer whether or not the address exists, so the form can't be used to discover accounts.
  return { ok: SENT_GENERIC };
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = z.object({ token: z.string().min(10).max(100), password, password2: z.string() })
    .refine((d) => d.password === d.password2, { path: ["password2"], message: "كلمتا المرور غير متطابقتين" })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return fail("راجع الحقول المظللة.", fieldErrorsOf(parsed.error));
  if (!(await rateLimit(`reset:ip:${await ipHash()}`, 20, 3600))) return fail("محاولات كثيرة. حاول لاحقاً.");
  const pw = await hashPassword(parsed.data.password);
  const userId = await tx(async (c) => {
    const t = await consumeToken(c, "reset", parsed.data.token);
    if (!t) return null;
    // Reaching the inbox proves the address, so a reset also verifies it; any lockout is cleared.
    await c.query(`UPDATE users SET password_hash = $2, failed_logins = 0, locked_until = NULL,
                   email_verified_at = COALESCE(email_verified_at, now()) WHERE id = $1`, [t.user_id, pw]);
    await c.query(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [t.user_id]);
    await audit("auth.password_reset", "user", t.user_id, t.user_id, {}, c);
    return t.user_id;
  });
  if (!userId) return fail("انتهت صلاحية الرابط أو استُخدم من قبل. اطلب رابطاً جديداً.");
  redirect("/login?reset=1");
}

/** Logged-in user asks for the verification link again. */
export async function resendVerificationAction(_: ActionState): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.email_verified) return { ok: "بريدك مؤكد بالفعل." };
  if (!(await rateLimit(`verify:user:${user.id}`, 4, 3600))) return fail("أرسلنا عدة رسائل خلال الساعة الأخيرة. انتظر قليلاً ثم حاول.");
  const r = await sendTokenEmail(user.id, "verify");
  return r.ok ? { ok: `أرسلنا رابط التأكيد إلى ${user.email}.` } : fail("تعذّر إرسال الرسالة الآن. حاول بعد قليل أو راسلنا على واتساب.");
}
