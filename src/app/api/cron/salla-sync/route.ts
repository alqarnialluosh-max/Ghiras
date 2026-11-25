import { NextResponse } from "next/server";
import { safeEqual } from "@/lib/crypto";
import { syncRecentOrders } from "@/lib/salla-orders";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const key = req.headers.get("x-cron-key") ?? "";
  const expected = process.env.HASH_SECRET ?? "";
  if (!key || !expected || !safeEqual(key, expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return NextResponse.json(await syncRecentOrders());
}
