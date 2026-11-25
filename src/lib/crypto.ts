import "server-only";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "./env";

/** AES-256-GCM. Output: v1.<iv>.<tag>.<ciphertext> (base64url) */
export function encrypt(plain: string | null | undefined): string | null {
  if (plain == null || plain === "") return null;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", env.encryptionKey, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(payload: string | null | undefined): string | null {
  if (!payload) return null;
  const [v, iv, tag, ct] = payload.split(".");
  if (v !== "v1" || !iv || !tag || !ct) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", env.encryptionKey, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function hmac(value: string): string {
  return createHmac("sha256", env.hashSecret).update(value).digest("hex");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Saudi mobile → 9665XXXXXXXX. Returns null if invalid. */
export function normalizeSaudiPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let d = input
    .replace(/[٠-٩]/g, (c) => String("٠١٢٣٤٥٦٧٨٩".indexOf(c)))
    .replace(/[^0-9]/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("966")) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return /^5\d{8}$/.test(d) ? `966${d}` : null;
}

export function phoneHash(input: string | null | undefined): string | null {
  const n = normalizeSaudiPhone(input);
  return n ? hmac(`phone:${n}`) : null;
}

/** Human-friendly reference without ambiguous characters. */
export function makeReference(prefix = "GH"): string {
  const alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  const bytes = randomBytes(6);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `${prefix}-${out}`;
}
