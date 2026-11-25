import "server-only";
import { headers } from "next/headers";
import { hmac } from "./crypto";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "0.0.0.0").trim();
}

/** We never store raw IPs — only a keyed hash, enough for abuse detection. */
export async function ipHash(): Promise<string> {
  return hmac(`ip:${await clientIp()}`).slice(0, 32);
}

export async function userAgent(): Promise<string> {
  const h = await headers();
  return (h.get("user-agent") ?? "").slice(0, 300);
}
