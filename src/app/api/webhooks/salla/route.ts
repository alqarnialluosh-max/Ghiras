import { NextResponse } from "next/server";
import { tx } from "@/lib/db";
import { env } from "@/lib/env";
import { parseSallaOrder, verifySallaSignature } from "@/lib/salla";
import { activateSubscription } from "@/lib/subscriptions";

export const dynamic = "force-dynamic";
const MAX_BODY = 512 * 1024;

export async function POST(req: Request) {
  const raw = await req.text();
  if (raw.length > MAX_BODY) return NextResponse.json({ error: "too large" }, { status: 413 });
  if (!verifySallaSignature(raw, req.headers.get("x-salla-signature"))) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: Record<string, unknown>;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }

  const o = parseSallaOrder(payload);
  const isOrderEvent = o.event.startsWith("order.");
  const paid = !!o.statusSlug && env.sallaPaidStatuses.includes(o.statusSlug);

  const result = await tx(async (c) => {
    const record = async (match: string, subscriptionId: string | null = null) => {
      await c.query(
        `INSERT INTO salla_events (event, order_id, order_status, customer_email, customer_phone_hash, amount_sar,
                                   product_refs, payload, match_status, subscription_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [o.event, o.orderId, o.statusSlug, o.email, o.phoneHash, o.amount, o.productRefs, raw, match, subscriptionId],
      );
      return match;
    };

    if (!isOrderEvent || !o.orderId || !paid) return record("ignored");

    // Idempotency: this order already activated something
    const { rows: done } = await c.query(`SELECT id FROM subscriptions WHERE salla_order_id = $1`, [o.orderId]);
    if (done[0]) return record("ignored", done[0].id);

    // Which of our plans does this order contain? (Salla product id, or SKU = plan code)
    const { rows: plans } = await c.query<{ code: string; price_sar: string }>(
      `SELECT code, price_sar FROM plans WHERE salla_product_id = ANY($1::text[]) OR code = ANY($1::text[])`,
      [o.productRefs],
    );
    if (!plans.length || (!o.email && !o.phoneHash)) return record("unmatched");

    // Oldest pending request by the same customer (email or phone) for that plan
    const { rows: cand } = await c.query<{ id: string; price_sar: string }>(
      `SELECT s.id, s.price_sar FROM subscriptions s JOIN users u ON u.id = s.parent_id
        WHERE s.status = 'pending_payment' AND s.plan_code = ANY($1::text[])
          AND (u.email = $2 OR (u.phone_hash IS NOT NULL AND u.phone_hash = $3))
        ORDER BY s.created_at ASC
        LIMIT 1 FOR UPDATE OF s SKIP LOCKED`,
      [plans.map((p) => p.code), o.email, o.phoneHash],
    );
    const sub = cand[0];
    if (!sub) return record("unmatched");
    // Guard against underpayment (coupons etc. go to manual review)
    if (o.amount != null && o.amount + 0.01 < Number(sub.price_sar)) return record("unmatched");

    await activateSubscription(c, sub.id, { orderId: o.orderId, note: `Salla ${o.event} (${o.statusSlug})` });
    return record("matched", sub.id);
  });

  return NextResponse.json({ ok: true, result });
}
