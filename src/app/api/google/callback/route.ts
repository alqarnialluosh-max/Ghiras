import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { site } from "@/config/site";

/** Public base of the site (GOOGLE_REDIRECT_BASE overrides, for local testing). Must match the redirect URI registered in Google. */
const BASE = () => (process.env.GOOGLE_REDIRECT_BASE || site.url).replace(/\/$/, "");
import { audit } from "@/lib/audit";
import { requirePerm } from "@/lib/auth";
import { completeAuthorization, MeetError } from "@/lib/google-meet";

export const dynamic = "force-dynamic";

const back = (q: string) => NextResponse.redirect(`${BASE()}/admin/teams?${q}`);

export async function GET(req: NextRequest) {
  const admin = await requirePerm("settings.manage");
  const jar = await cookies();
  const expected = jar.get("ghiras_g_state")?.value ?? "";
  jar.delete({ name: "ghiras_g_state", path: "/api/google" });
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const code = req.nextUrl.searchParams.get("code") ?? "";
  const denied = req.nextUrl.searchParams.get("error");
  if (denied) return back(`google_error=${encodeURIComponent("أُلغي الربط من صفحة Google.")}`);
  const same = expected.length > 0 && expected.length === state.length && timingSafeEqual(Buffer.from(expected), Buffer.from(state));
  if (!same || !code) return back(`google_error=${encodeURIComponent("انتهت صلاحية طلب الربط. ابدأ من جديد.")}`);
  try {
    const email = await completeAuthorization(code, BASE(), admin.id);
    await audit("google.connect", "google", null, admin.id, { email });
    return back("google_connected=1");
  } catch (e) {
    return back(`google_error=${encodeURIComponent(e instanceof MeetError ? e.message : "تعذّر إكمال الربط.")}`);
  }
}
