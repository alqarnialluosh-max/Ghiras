import "server-only";
import { decrypt, encrypt } from "./crypto";
import { one, q, tx } from "./db";

/**
 * Salla Merchant API client (Salla Partners app, Easy Mode).
 * - Tokens arrive via the `app.store.authorize` webhook and are stored encrypted.
 * - Access tokens (≈14 days) are refreshed automatically a day before expiry.
 * - Refreshes are serialized with a row lock, because a refresh token must not be
 *   used twice (we always store the newly issued refresh token).
 */
const API = () => (process.env.SALLA_API_BASE ?? "https://api.salla.dev/admin/v2").replace(/\/$/, "");
const ACCOUNTS = () => (process.env.SALLA_ACCOUNTS_BASE ?? "https://accounts.salla.sa").replace(/\/$/, "");
const REFRESH_BEFORE_MS = 24 * 3600_000;
const TIMEOUT_MS = 15_000;

export function sallaAppConfigured() {
  return !!(process.env.SALLA_CLIENT_ID && process.env.SALLA_CLIENT_SECRET);
}

export class SallaApiError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}

async function log(action: string, ok: boolean, detail: string, http_status?: number, order_id?: string | null) {
  await q(`INSERT INTO salla_api_log (action, order_id, ok, http_status, detail) VALUES ($1,$2,$3,$4,$5)`,
    [action, order_id ?? null, ok, http_status ?? null, detail.slice(0, 1000)]).catch(() => {});
}

type Json = Record<string, unknown>;

/** Called from the webhook when the merchant installs/re-authorizes the app. */
export async function saveAuthorization(payload: Json) {
  const d = (payload.data ?? {}) as Json;
  const access = String(d.access_token ?? "");
  const refresh = String(d.refresh_token ?? "");
  if (!access || !refresh) throw new Error("authorize payload without tokens");
  const expires = typeof d.expires === "number" ? new Date(d.expires * 1000)
    : typeof d.expires_in === "number" ? new Date(Date.now() + d.expires_in * 1000)
    : new Date(Date.now() + 14 * 86400_000);
  const merchant = String(payload.merchant ?? d.merchant ?? "");
  await tx(async (c) => {
    await c.query(`UPDATE salla_connections SET revoked_at = now(), revoke_reason = 'replaced' WHERE revoked_at IS NULL`);
    await c.query(
      `INSERT INTO salla_connections (merchant_id, access_token_enc, refresh_token_enc, expires_at, scope)
       VALUES ($1,$2,$3,$4,$5)`,
      [merchant, encrypt(access), encrypt(refresh), expires, d.scope ? String(d.scope) : null],
    );
  });
  await log("authorize", true, `merchant ${merchant}`);
  // Best effort: remember the store name for the dashboard
  storeInfo().then(async (info) => {
    const name = (info as { data?: { merchant?: { name?: string } } })?.data?.merchant?.name;
    if (name) await q(`UPDATE salla_connections SET store_name = $1 WHERE revoked_at IS NULL`, [name]);
  }).catch(() => {});
}

export async function revokeConnection(reason: string) {
  await q(`UPDATE salla_connections SET revoked_at = now(), revoke_reason = $1 WHERE revoked_at IS NULL`, [reason]);
  await log("revoke", true, reason);
}

export function activeConnection() {
  return one<{ id: string; merchant_id: string; store_name: string | null; expires_at: Date; scope: string | null;
    connected_at: Date; refreshed_at: Date | null }>(
    `SELECT id, merchant_id, store_name, expires_at, scope, connected_at, refreshed_at
       FROM salla_connections WHERE revoked_at IS NULL ORDER BY connected_at DESC LIMIT 1`);
}

async function refreshTokens(force = false): Promise<string> {
  const result = await tx(async (c): Promise<{ token: string } | { error: string; status?: number }> => {
    const { rows } = await c.query<{ id: string; access_token_enc: string; refresh_token_enc: string; expires_at: Date }>(
      `SELECT id, access_token_enc, refresh_token_enc, expires_at FROM salla_connections
        WHERE revoked_at IS NULL ORDER BY connected_at DESC LIMIT 1 FOR UPDATE`);
    const row = rows[0];
    if (!row) return { error: "المتجر غير مربوط بعد" };
    // Another request may have refreshed while we waited for the lock
    if (!force && row.expires_at.getTime() - Date.now() > REFRESH_BEFORE_MS) return { token: decrypt(row.access_token_enc)! };

    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: decrypt(row.refresh_token_enc) ?? "",
      client_id: process.env.SALLA_CLIENT_ID ?? "",
      client_secret: process.env.SALLA_CLIENT_SECRET ?? "",
    });
    const res = await fetch(`${ACCOUNTS()}/oauth2/token`, {
      method: "POST", body, signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    });
    const json = (await res.json().catch(() => ({}))) as Json;
    if (!res.ok || !json.access_token) {
      await log("refresh", false, JSON.stringify(json).slice(0, 300), res.status);
      if (res.status === 400 || res.status === 401) {
        await c.query(`UPDATE salla_connections SET revoked_at = now(), revoke_reason = 'refresh_failed' WHERE id = $1`, [row.id]);
      }
      return { error: "تعذّر تجديد مفتاح سلة. أعد تثبيت التطبيق على المتجر.", status: res.status };
    }
    const expiresIn = Number(json.expires_in ?? 14 * 86400);
    await c.query(
      `UPDATE salla_connections SET access_token_enc = $2, refresh_token_enc = $3, expires_at = $4, refreshed_at = now() WHERE id = $1`,
      [row.id, encrypt(String(json.access_token)), encrypt(String(json.refresh_token ?? decrypt(row.refresh_token_enc))),
       new Date(Date.now() + expiresIn * 1000)]);
    await log("refresh", true, "token refreshed", res.status);
    return { token: String(json.access_token) };
  });
  if ("error" in result) throw new SallaApiError(result.error, result.status);
  return result.token;
}

async function accessToken(): Promise<string> {
  const row = await one<{ access_token_enc: string; expires_at: Date }>(
    `SELECT access_token_enc, expires_at FROM salla_connections WHERE revoked_at IS NULL ORDER BY connected_at DESC LIMIT 1`);
  if (!row) throw new SallaApiError("المتجر غير مربوط بعد");
  if (row.expires_at.getTime() - Date.now() < REFRESH_BEFORE_MS) return refreshTokens();
  return decrypt(row.access_token_enc)!;
}

/** Authenticated call with one automatic retry after a forced refresh on 401. */
export async function sallaFetch<T = Json>(path: string, init: RequestInit = {}, base = API()): Promise<T> {
  let token = await accessToken();
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(`${base}${path}`, {
      ...init, signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { Accept: "application/json", "Content-Type": "application/json", ...(init.headers ?? {}), Authorization: `Bearer ${token}` },
    });
    if (res.status === 401 && attempt === 0) { token = await refreshTokens(true); continue; }
    const json = (await res.json().catch(() => ({}))) as T & { error?: { message?: string } };
    if (!res.ok) throw new SallaApiError(json?.error?.message ?? `Salla HTTP ${res.status}`, res.status);
    return json;
  }
  throw new SallaApiError("Salla unauthorized", 401);
}

export function storeInfo() {
  return sallaFetch("/oauth2/user/info", {}, ACCOUNTS());
}

export async function updateOrderStatus(orderId: string, slug: string) {
  try {
    await sallaFetch(`/orders/${encodeURIComponent(orderId)}/status`, { method: "POST", body: JSON.stringify({ slug }) });
    await log("order_status", true, `→ ${slug}`, 200, orderId);
    return true;
  } catch (e) {
    await log("order_status", false, (e as Error).message, (e as SallaApiError).status, orderId);
    return false;
  }
}

export type SallaOrderSummary = { id: number | string; reference_id?: number | string; status?: { slug?: string }; date?: { date?: string } };

export async function listRecentOrders(fromDate: string, maxPages = 5) {
  const out: SallaOrderSummary[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const res = await sallaFetch<{ data?: SallaOrderSummary[]; pagination?: { totalPages?: number } }>(
      `/orders?from_date=${encodeURIComponent(fromDate)}&per_page=50&page=${page}`);
    out.push(...(res.data ?? []));
    if (!res.pagination?.totalPages || page >= res.pagination.totalPages) break;
  }
  return out;
}

export async function getOrder(orderId: string) {
  const res = await sallaFetch<{ data?: Json }>(`/orders/${encodeURIComponent(orderId)}`);
  return res.data ?? null;
}

export async function listProducts() {
  const res = await sallaFetch<{ data?: { id: number; name: string; sku?: string; price?: { amount?: number }; urls?: { customer?: string } }[] }>(
    `/products?per_page=50`);
  return res.data ?? [];
}

export { log as sallaLog };
