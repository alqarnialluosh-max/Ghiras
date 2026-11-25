import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/parent", "/teacher", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isProd = process.env.NODE_ENV === "production";
  const cookieName = isProd ? "__Host-ghiras" : "ghiras";

  // Cheap gate: no session cookie → login. Real verification happens server-side on every page/action.
  if (PROTECTED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get(cookieName)) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isProd ? "" : " 'unsafe-eval'"}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src 'self' data: blob:`,
    `font-src 'self' data:`,
    `connect-src 'self'${isProd ? "" : " ws:"}`,
    `frame-ancestors 'none'`,
    `form-action 'self'`,
    `base-uri 'self'`,
    `object-src 'none'`,
    isProd ? `upgrade-insecure-requests` : ``,
  ].filter(Boolean).join("; ");

  const reqHeaders = new Headers(req.headers);
  reqHeaders.set("x-nonce", nonce);
  reqHeaders.set("Content-Security-Policy", csp);

  const res = NextResponse.next({ request: { headers: reqHeaders } });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (isProd) res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  if (PROTECTED.some((p) => pathname.startsWith(p))) res.headers.set("Cache-Control", "private, no-store");
  return res;
}

export const config = {
  // Webhooks get no CSP/redirect handling; static assets skipped.
  matcher: ["/((?!api/webhooks|_next/static|_next/image|icon.svg|robots.txt).*)"],
};
