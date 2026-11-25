import { NextResponse } from "next/server";
import { parseSallaOrder, verifySallaSignature } from "@/lib/salla";
import { revokeConnection, sallaLog, saveAuthorization } from "@/lib/salla-api";
import { processSallaOrder, pushFulfilledStatus } from "@/lib/salla-orders";

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
  const event = String(payload.event ?? "");

  // ---- App lifecycle (Salla Partners app, Easy Mode) ----
  if (event === "app.store.authorize") {
    try { await saveAuthorization(payload); }
    catch (e) { await sallaLog("authorize", false, (e as Error).message); return NextResponse.json({ ok: false }, { status: 400 }); }
    return NextResponse.json({ ok: true, result: "authorized" });
  }
  if (event === "app.uninstalled" || event === "app.expired" || event === "app.subscription.expired") {
    await revokeConnection(event);
    return NextResponse.json({ ok: true, result: "revoked" });
  }
  if (event.startsWith("app.")) return NextResponse.json({ ok: true, result: "ignored" });

  // ---- Store order events ----
  const o = parseSallaOrder(payload);
  const res = await processSallaOrder(o, raw, { recordIgnored: event.startsWith("order.") });

  // Tell Salla the order is fulfilled — after responding quickly (retried by the sync job if it fails)
  if (res.result === "matched" && res.subscriptionId) {
    void pushFulfilledStatus(res.subscriptionId).catch(() => {});
  }
  return NextResponse.json({ ok: true, result: res.result });
}
