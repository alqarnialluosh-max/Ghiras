import "server-only";
import { can, type Permission, type StaffRole } from "./permissions";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { one, q } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { ipHash, userAgent } from "./request";

export const SESSION_COOKIE = env.isProd ? "__Host-ghiras" : "ghiras";
/** Families and teachers stay signed in while they keep using the site; the owner's account is shorter-lived. */
const SESSION_DAYS: Record<Role, number> = { parent: 30, teacher: 30, admin: 3, staff: 3 };
export const COOKIE_MAX_DAYS = 30;

export type Role = "parent" | "teacher" | "admin" | "staff";
export type SessionUser = {
  id: string;
  role: Role;
  status: "active" | "pending" | "suspended";
  full_name: string;
  email: string;
  email_verified: boolean;
  staff_role: StaffRole | null;
  permissions: string[] | null;
  session_id: string;
};

// OWASP-recommended argon2id parameters
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(pw: string) { return hash(pw, ARGON); }
export async function verifyPassword(hashStr: string, pw: string) {
  try { return await verify(hashStr, pw); } catch { return false; }
}
/** Used to equalize timing when the email does not exist. */
let dummyHash: string | null = null;
export async function burnPasswordTime(pw: string) {
  dummyHash ??= await hashPassword("ghiras-dummy-password-for-timing");
  await verifyPassword(dummyHash, pw);
}

export async function createSession(userId: string) {
  const token = randomToken(32);
  const id = sha256(token);
  const role = (await one<{ role: Role }>(`SELECT role FROM users WHERE id = $1`, [userId]))?.role ?? "parent";
  const expires = new Date(Date.now() + SESSION_DAYS[role] * 86400_000);
  await q(
    `INSERT INTO auth_sessions (id, user_id, expires_at, ip_hash, user_agent) VALUES ($1,$2,$3,$4,$5)`,
    [id, userId, expires, await ipHash(), await userAgent()],
  );
  await q(`UPDATE users SET last_login_at = now(), failed_logins = 0, locked_until = NULL WHERE id = $1`, [userId]);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token || token.length > 100) return null;
  const id = sha256(token);
  const row = await one<Omit<SessionUser, "email_verified"> & { expires_at: Date; email_verified_at: Date | null }>(
    `SELECT u.id, u.role, u.status, u.full_name, u.email, u.email_verified_at, u.staff_role, u.permissions, s.id AS session_id, s.expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.archived_at IS NULL AND u.status <> 'suspended'`,
    [id],
  );
  if (!row) return null;
  // Sliding expiry: activity extends the session (the middleware keeps the cookie alive alongside).
  const days = SESSION_DAYS[row.role];
  if (row.expires_at.getTime() - Date.now() < (days / 2) * 86400_000) {
    await q(`UPDATE auth_sessions SET expires_at = now() + make_interval(days => $2) WHERE id = $1`, [id, days]);
  }
  return { id: row.id, role: row.role, status: row.status, full_name: row.full_name, email: row.email,
    email_verified: !!row.email_verified_at, staff_role: row.staff_role, permissions: row.permissions, session_id: row.session_id };
});

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await q(`UPDATE auth_sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [sha256(token)]);
  jar.delete(SESSION_COOKIE);
}

export async function revokeAllSessions(userId: string) {
  await q(`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
}

export function homeFor(role: Role) {
  return role === "admin" || role === "staff" ? "/admin" : role === "teacher" ? "/teacher" : "/parent";
}

/** Page/action guard. Redirects instead of throwing so users land somewhere sensible. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}

/** Unverified email blocks paying and booking — but only once email can actually be delivered. */
export async function needsEmailVerification(user: SessionUser) {
  const { emailConfigured } = await import("./email");
  return !user.email_verified && emailConfigured();
}

/** Administration guard: the owner, or a staff member holding at least one of these permissions. */
export async function requirePerm(...any: Permission[]): Promise<SessionUser> {
  const user = await requireRole("admin", "staff");
  if (any.length && !can(user, ...any)) redirect("/admin?denied=1");
  return user;
}
