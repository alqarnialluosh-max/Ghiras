"use server";
import { audit } from "@/lib/audit";
import { getSessionUser, hashPassword, verifyPassword } from "@/lib/auth";
import { one, q } from "@/lib/db";
import { rateLimit } from "@/lib/rate-limit";
import { fail, password, type ActionState } from "@/lib/validation";

export async function changePasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const user = await getSessionUser();
  if (!user) return fail("سجّل الدخول أولاً.");
  if (!(await rateLimit(`pwchange:${user.id}`, 10, 3600))) return fail("محاولات كثيرة، حاول لاحقاً.");
  const parsed = password.safeParse(fd.get("password"));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const row = await one<{ password_hash: string }>(`SELECT password_hash FROM users WHERE id = $1`, [user.id]);
  if (!row || !(await verifyPassword(row.password_hash, String(fd.get("current") ?? "")))) return fail("كلمة المرور الحالية غير صحيحة.");
  await q(`UPDATE users SET password_hash = $2 WHERE id = $1`, [user.id, await hashPassword(parsed.data)]);
  await q(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL`, [user.id, user.session_id]);
  await audit("user.password_change", "user", user.id, user.id);
  return { ok: "تم تغيير كلمة المرور." };
}
