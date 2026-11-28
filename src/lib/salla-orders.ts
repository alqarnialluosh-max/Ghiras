import "server-only";
import { one, pool, q, tx } from "./db";
import { env } from "./env";
import { parseSallaOrder } from "./salla";
import { activeConnection, getOrder, listRecentOrders, sallaLog, updateOrderStatus } from "./salla-api";
import { activateSubscription } from "./subscriptions";

type Parsed = ReturnType<typeof parseSallaOrder>;
export type MatchResult = "matched" | "unmatched" | "ignored";

/**
 * Matches a paid Salla order to a pending Ghiras subscription and activates it.
 * Idempotent: an order can activate at most one subscription, ever.
 */
export async function processSallaOrder(o: Parsed, raw: string, opts: { recordIgnored?: boolean } = {}) {
  const paid = !!o.statusSlug && env.sallaPaidStatuses.includes(o.statusSlug);
  const recordIgnored = opts.recordIgnored ?? true;

  return tx(async (c) => {
    const record = async (match: MatchResult, subscriptionId: string | null = null) => {
      if (match !== "ignored" || recordIgnored) {
        await c.query(
          `INSERT INTO salla_events (event, order_id, order_status, customer_email, customer_phone_hash, amount_sar,
                                     product_refs, payload, match_status, subscription_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [o.event, o.orderId, o.statusSlug, o.email, o.phoneHash, o.amount, o.productRefs, raw, match, subscriptionId]);
      }
      return { result: match, subscriptionId };
    };

    if (!o.orderId || !paid) return record("ignored");

    const { rows: done } = await c.query<{ id: string }>(`SELECT id FROM subscriptions WHERE salla_order_id = $1`, [o.orderId]);
    if (done[0]) return record("ignored", done[0].id);

    const { rows: plans } = await c.query<{ code: string }>(
      `SELECT code FROM plans WHERE salla_product_id = ANY($1::text[]) OR salla_legacy_ids && $1::text[] OR code = ANY($1::text[])`, [o.productRefs]);
    if (!plans.length || (!o.email && !o.phoneHash)) return record("unmatched");

    const { rows: cand } = await c.query<{ id: string; price_sar: string }>(
      `SELECT s.id, s.price_sar FROM subscriptions s JOIN users u ON u.id = s.parent_id
        WHERE s.status = 'pending_payment' AND s.plan_code = ANY($1::text[])
          AND (u.email = $2 OR (u.phone_hash IS NOT NULL AND u.phone_hash = $3))
        ORDER BY s.created_at ASC LIMIT 1 FOR UPDATE OF s SKIP LOCKED`,
      [plans.map((p) => p.code), o.email, o.phoneHash]);
    const sub = cand[0];
    if (!sub) return record("unmatched");
    if (o.amount != null && o.amount + 0.01 < Number(sub.price_sar)) return record("unmatched");

    await activateSubscription(c, sub.id, { orderId: o.orderId, note: `Salla ${o.event} (${o.statusSlug})` });
    return record("matched", sub.id);
  });
}

/** Tell Salla the order is fulfilled (best effort; retried by the sync job). */
export async function pushFulfilledStatus(subscriptionId: string) {
  const slugRow = await one<{ value: string }>(`SELECT value FROM settings WHERE key = 'salla_complete_status'`);
  const slug = slugRow?.value?.trim();
  if (!slug) return false;
  if (!(await activeConnection())) return false;
  const sub = await one<{ salla_order_id: string | null; salla_status_synced_at: Date | null }>(
    `SELECT salla_order_id, salla_status_synced_at FROM subscriptions WHERE id = $1`, [subscriptionId]);
  if (!sub?.salla_order_id || sub.salla_status_synced_at) return false;
  const ok = await updateOrderStatus(sub.salla_order_id, slug);
  if (ok) await q(`UPDATE subscriptions SET salla_status_synced_at = now() WHERE id = $1`, [subscriptionId]);
  return ok;
}

const SYNC_LOCK = 724_118; // pg advisory lock id (one sync at a time across instances)

/**
 * Safety net for missed webhooks: pulls recent Salla orders and processes any paid order
 * we have not linked yet, then retries pending "fulfilled" status updates.
 */
export async function syncRecentOrders(days = 3) {
  const summary = { checked: 0, matched: 0, unmatched: 0, statusPushed: 0, skipped: false, error: null as string | null };
  if (!(await activeConnection())) { summary.error = "المتجر غير مربوط"; return summary; }

  const lockClient = await pool.connect();
  try {
    const { rows } = await lockClient.query<{ ok: boolean }>(`SELECT pg_try_advisory_lock($1) AS ok`, [SYNC_LOCK]);
    if (!rows[0].ok) { summary.skipped = true; return summary; }
    try {
      const from = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
      const orders = await listRecentOrders(from);
      for (const ord of orders) {
        const id = String(ord.id);
        summary.checked++;
        const known = await one(
          `SELECT 1 FROM subscriptions WHERE salla_order_id = $1
           UNION ALL SELECT 1 FROM salla_events WHERE order_id = $1 AND match_status IN ('matched','unmatched') LIMIT 1`, [id]);
        if (known) continue;
        const slug = ord.status?.slug;
        if (slug && !env.sallaPaidStatuses.includes(slug)) continue;
        const details = await getOrder(id);
        if (!details) continue;
        const payload = { event: "sync.order", data: details };
        const res = await processSallaOrder(parseSallaOrder(payload), JSON.stringify(payload), { recordIgnored: false });
        if (res.result === "matched") summary.matched++;
        if (res.result === "unmatched") summary.unmatched++;
      }
      const pending = await q<{ id: string }>(
        `SELECT id FROM subscriptions WHERE salla_order_id IS NOT NULL AND salla_status_synced_at IS NULL
            AND status IN ('active','expired') AND starts_at > now() - interval '30 days' LIMIT 50`);
      for (const p of pending) if (await pushFulfilledStatus(p.id)) summary.statusPushed++;

      await q(`UPDATE settings SET value = $1, updated_at = now() WHERE key = 'salla_last_sync'`, [new Date().toISOString()]);
      await sallaLog("sync", true, JSON.stringify(summary));
    } finally {
      await lockClient.query(`SELECT pg_advisory_unlock($1)`, [SYNC_LOCK]);
    }
  } catch (e) {
    summary.error = (e as Error).message;
    await sallaLog("sync", false, summary.error);
  } finally {
    lockClient.release();
  }
  return summary;
}
