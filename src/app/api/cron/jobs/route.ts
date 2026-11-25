import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { sallaAppConfigured } from "@/lib/salla-api";
import { syncRecentOrders } from "@/lib/salla-orders";
import { retryPendingMeetings, teamsAutoConfigured } from "@/lib/teams";

export const dynamic = "force-dynamic";

/** Background jobs: Salla order sync + Teams meeting retries. Called by instrumentation.ts over localhost. */
export async function POST(req: Request) {
  const key = req.headers.get("x-cron-key") ?? "";
  const expected = process.env.HASH_SECRET ?? "";
  if (!key || !expected || !safeEqual(key, expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const out: Record<string, unknown> = {};
  if (sallaAppConfigured() && process.env.SALLA_SYNC_DISABLED !== "true") out.salla = await syncRecentOrders().catch((e) => ({ error: String(e) }));
  if (teamsAutoConfigured()) out.teams = await retryPendingMeetings().catch((e) => ({ error: String(e) }));
  return NextResponse.json(out);
}
