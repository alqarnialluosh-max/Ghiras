import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { hash, verify } from "@node-rs/argon2";
import { one, q } from "./db";
import { randomToken, sha256 } from "./crypto";
import { env } from "./env";
import { ipHash, userAgent } from "./request";

export const SESSION_COOKIE = env.isProd ? "__Host-ghiras" : "ghiras";
const SESSION_DAYS = 30;
const REFRESH_WHEN_DAYS_LEFT = 15;

export type Role = "parent" | "teacher" | "admin";
export type SessionUser = {
  id: string;
  role: Role;
  status: "active" | "pending" | "suspended";
  full_name: string;
  email: string;
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
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
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
  const row = await one<SessionUser & { expires_at: Date }>(
    `SELECT u.id, u.role, u.status, u.full_name, u.email, s.id AS session_id, s.expires_at
       FROM auth_sessions s JOIN users u ON u.id = s.user_id
      WHERE s.id = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND u.archived_at IS NULL AND u.status <> 'suspended'`,
    [id],
  );
  if (!row) return null;
  // Sliding expiry (DB only; cookie is refreshed on next login/mutation)
  if (row.expires_at.getTime() - Date.now() < REFRESH_WHEN_DAYS_LEFT * 86400_000) {
    await q(`UPDATE auth_sessions SET expires_at = now() + interval '${SESSION_DAYS} days' WHERE id = $1`, [id]);
  }
  return { id: row.id, role: row.role, status: row.status, full_name: row.full_name, email: row.email, session_id: row.session_id };
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
  return role === "admin" ? "/admin" : role === "teacher" ? "/teacher" : "/parent";
}

/** Page/action guard. Redirects instead of throwing so users land somewhere sensible. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!roles.includes(user.role)) redirect(homeFor(user.role));
  return user;
}
