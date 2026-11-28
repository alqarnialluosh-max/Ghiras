import "server-only";
import { decrypt, encrypt } from "./crypto";
import { one, q } from "./db";

/**
 * Google Meet through the Meet REST API, on behalf of the Google Workspace account the owner linked (OAuth, offline).
 * Each session gets its own space with accessType OPEN: anyone with the link joins directly (no host, no knocking),
 * which is what a teacher and a student need. Scope: meetings.space.created (create spaces only; no mail/calendar access).
 */
const AUTH = () => (process.env.GOOGLE_AUTH_BASE ?? "https://accounts.google.com").replace(/\/$/, "");
const TOKEN = () => (process.env.GOOGLE_TOKEN_URL ?? "https://oauth2.googleapis.com/token");
const MEET = () => (process.env.GOOGLE_MEET_BASE ?? "https://meet.googleapis.com/v2").replace(/\/$/, "");
export const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const TIMEOUT_MS = 15_000;

export class MeetError extends Error {}

export function googleAppConfigured() {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}
export const googleRedirectUri = (origin: string) => `${origin.replace(/\/$/, "")}/api/google/callback`;

async function log(action: string, ok: boolean, detail: string, http_status?: number, booking_id?: string | null) {
  await q(`INSERT INTO teams_api_log (action, booking_id, ok, http_status, detail) VALUES ($1,$2,$3,$4,$5)`,
    [`meet.${action}`, booking_id ?? null, ok, http_status ?? null, detail.slice(0, 1000)]).catch(() => {});
}

let readyCache: { at: number; ok: boolean } | null = null;
/** App keys present and an account linked (cached for a minute). */
export async function googleReady() {
  if (!googleAppConfigured()) return false;
  if (readyCache && Date.now() - readyCache.at < 60_000) return readyCache.ok;
  const row = await one(`SELECT 1 FROM google_connections WHERE revoked_at IS NULL`);
  readyCache = { at: Date.now(), ok: !!row };
  return readyCache.ok;
}
const resetCaches = () => { readyCache = null; access = null; };

export function activeGoogleConnection() {
  return one<{ id: string; email: string; connected_at: Date; scopes: string }>(
    `SELECT id, email, connected_at, scopes FROM google_connections WHERE revoked_at IS NULL`);
}

export function authorizeUrl(origin: string, state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "", redirect_uri: googleRedirectUri(origin), response_type: "code",
    scope: `openid email ${MEET_SCOPE}`, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state,
  });
  return `${AUTH()}/o/oauth2/v2/auth?${p}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; scope?: string; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN(), {
    method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "", ...body }),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as TokenResponse };
}

/** OAuth callback: exchange the code, keep the refresh token encrypted, retire any previous link. */
export async function completeAuthorization(code: string, origin: string, userId: string) {
  const { status, json } = await tokenRequest({ code, grant_type: "authorization_code", redirect_uri: googleRedirectUri(origin) });
  if (status >= 300 || !json.access_token) {
    await log("authorize", false, json.error_description ?? json.error ?? `HTTP ${status}`, status);
    throw new MeetError("رفضت Google الطلب. أعد المحاولة.");
  }
  if (!json.refresh_token) throw new MeetError("لم تُرسل Google صلاحية دائمة. أزل «Ghiras» من أذونات حساب Google ثم اربط من جديد.");
  if (!(json.scope ?? "").includes(MEET_SCOPE)) throw new MeetError("لم تُمنح صلاحية إنشاء اجتماعات Meet. أعد الربط ووافق على كل الصلاحيات.");
  let email = "";
  try { email = JSON.parse(Buffer.from((json.id_token ?? "").split(".")[1] ?? "", "base64url").toString()).email ?? ""; } catch { /* optional */ }
  await q(`UPDATE google_connections SET revoked_at = now(), revoke_reason = 'استُبدل بربط جديد' WHERE revoked_at IS NULL`);
  await q(`INSERT INTO google_connections (email, refresh_token_enc, scopes, connected_by) VALUES ($1,$2,$3,$4)`,
    [email || "(غير معروف)", encrypt(json.refresh_token), json.scope ?? MEET_SCOPE, userId]);
  resetCaches();
  await log("authorize", true, `linked ${email}`, status);
  return email;
}

export async function disconnectGoogle(reason = "فصل من المالك") {
  await q(`UPDATE google_connections SET revoked_at = now(), revoke_reason = $1 WHERE revoked_at IS NULL`, [reason]);
  resetCaches();
}

let access: { token: string; exp: number } | null = null;
async function accessToken() {
  if (access && access.exp - Date.now() > 120_000) return access.token;
  const row = await one<{ refresh_token_enc: string }>(`SELECT refresh_token_enc FROM google_connections WHERE revoked_at IS NULL`);
  if (!row) throw new MeetError("حساب Google غير مربوط.");
  const { status, json } = await tokenRequest({ grant_type: "refresh_token", refresh_token: decrypt(row.refresh_token_enc) ?? "" });
  if (status >= 300 || !json.access_token) {
    await log("token", false, json.error_description ?? json.error ?? `HTTP ${status}`, status);
    // the owner revoked access in Google, or the password changed: stop using it so sessions fall back cleanly
    if (json.error === "invalid_grant") await disconnectGoogle("ألغت Google الصلاحية (invalid_grant)");
    throw new MeetError("تعذّر الاتصال بحساب Google. أعد الربط من صفحة الاجتماعات.");
  }
  access = { token: json.access_token, exp: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return access.token;
}

type Space = { name?: string; meetingUri?: string; meetingCode?: string; error?: { message?: string; status?: string } };

/** A new Meet space anyone with the link can join directly. */
export async function createSpace(bookingId?: string): Promise<{ name: string; uri: string }> {
  const call = async (body: object) => {
    const res = await fetch(`${MEET()}/spaces`, {
      method: "POST", signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${await accessToken()}` },
      body: JSON.stringify(body),
    });
    if (res.status === 401) access = null;
    return { status: res.status, json: (await res.json().catch(() => ({}))) as Space };
  };
  let r = await call({ config: { accessType: "OPEN", entryPointAccess: "ALL" } });
  if (r.status === 400) {
    // some account types refuse OPEN: fall back to the default (guests ask to join)
    await log("create", false, `OPEN refused: ${r.json.error?.message ?? ""}`, r.status, bookingId);
    r = await call({});
  }
  if (r.status >= 300 || !r.json.meetingUri || !r.json.name) {
    await log("create", false, r.json.error?.message ?? `HTTP ${r.status}`, r.status, bookingId);
    throw new MeetError(r.json.error?.message ?? `Meet HTTP ${r.status}`);
  }
  await log("create", true, r.json.name, r.status, bookingId);
  return { name: r.json.name, uri: r.json.meetingUri };
}
