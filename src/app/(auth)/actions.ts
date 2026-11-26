"use server";
import { redirect } from "next/navigation";
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
  fail, fieldErrorsOf, keepValues, loginSchema, parentRegisterSchema, safeNext, teacherRegisterSchema, type ActionState,
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
      return rows[0].id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return fail("هذا البريد مسجل مسبقاً.", { email: "البريد مسجل مسبقاً" }, values);
    throw e;
  }
  await audit("user.register", "user", userId, userId, { role: "teacher" });
  await createSession(userId);
  redirect("/teacher");
}

export async function logoutAction() {
  const u = await getSessionUser();
  await destroySession();
  if (u) await audit("auth.logout", "user", u.id, u.id);
  redirect("/");
}
