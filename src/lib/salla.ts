import "server-only";
import { createHmac } from "node:crypto";
import { safeEqual, phoneHash } from "./crypto";
import { env } from "./env";

/**
 * Salla signs webhooks with HMAC-SHA256 of the raw body using the webhook secret,
 * sent in the `X-Salla-Signature` header (security strategy: "Signature").
 */
export function verifySallaSignature(rawBody: string, signature: string | null): boolean {
  const secret = env.sallaWebhookSecret;
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  return safeEqual(expected, signature.trim().toLowerCase());
}

type Json = Record<string, unknown>;
const get = (o: unknown, path: string): unknown =>
  path.split(".").reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Json)[k] : undefined), o);
const str = (v: unknown) => (v == null ? null : String(v));

/** Defensive extraction — Salla payload fields vary slightly between events/versions. */
export function parseSallaOrder(payload: Json) {
  const data = (payload.data ?? {}) as Json;
  const order = (get(data, "order") as Json) ?? data;
  const customer = (order.customer ?? data.customer ?? {}) as Json;

  const statusSlug =
    str(get(order, "status.slug")) ?? str(get(order, "status.customized.slug")) ??
    str(get(data, "status.slug")) ?? str(order.status) ?? null;

  const mobile = [str(customer.mobile_code) ?? "", str(customer.mobile) ?? ""].join("");
  const items = (Array.isArray(order.items) ? order.items : []) as Json[];
  const productRefs = new Set<string>();
  for (const it of items) {
    for (const p of ["product.id", "product_id", "id", "sku", "product.sku"]) {
      const v = str(get(it, p));
      if (v) productRefs.add(v);
    }
  }

  const amount = Number(get(order, "amounts.total.amount") ?? get(order, "total.amount") ?? get(order, "total") ?? NaN);

  return {
    event: str(payload.event) ?? "unknown",
    orderId: str(order.id) ?? str(get(data, "id")),
    orderReference: str(order.reference_id),
    statusSlug,
    email: (str(customer.email) ?? "").trim().toLowerCase() || null,
    phoneHash: phoneHash(mobile),
    amount: Number.isFinite(amount) ? amount : null,
    productRefs: [...productRefs],
  };
}
