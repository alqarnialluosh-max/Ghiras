import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { site } from "@/config/site";

/** Public base of the site (GOOGLE_REDIRECT_BASE overrides, for local testing). Must match the redirect URI registered in Google. */
const BASE = () => (process.env.GOOGLE_REDIRECT_BASE || site.url).replace(/\/$/, "");
import { requirePerm } from "@/lib/auth";
import { randomToken } from "@/lib/crypto";
import { authorizeUrl, googleAppConfigured } from "@/lib/google-meet";

export const dynamic = "force-dynamic";

/** Owner starts linking Google Meet: a one-time state (CSRF) in a short-lived cookie, then off to Google. */
export async function GET() {
  await requirePerm("settings.manage");
  if (!googleAppConfigured()) return NextResponse.redirect(`${BASE()}/admin/teams?google_error=${encodeURIComponent("أضف مفاتيح Google في Railway أولاً.")}`);
  const state = randomToken(24);
  (await cookies()).set("ghiras_g_state", state, {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/google", maxAge: 600,
  });
  return NextResponse.redirect(authorizeUrl(BASE(), state));
}
