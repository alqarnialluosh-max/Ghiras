import "server-only";

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable: ${name}`);
  return v;
}

export const env = {
  get databaseUrl() { return required("DATABASE_URL"); },
  /** 32-byte key, base64. Encrypts phone numbers & private notes at rest. */
  get encryptionKey() {
    const key = Buffer.from(required("ENCRYPTION_KEY"), "base64");
    if (key.length !== 32) throw new Error("ENCRYPTION_KEY must be 32 bytes (base64)");
    return key;
  },
  /** Secret for HMAC lookups (phone hash, IP hash). */
  get hashSecret() { return required("HASH_SECRET"); },
  get sallaWebhookSecret() { return process.env.SALLA_WEBHOOK_SECRET ?? ""; },
  /** Order status slugs that mean "paid" in Salla. */
  get sallaPaidStatuses() {
    return (process.env.SALLA_PAID_STATUSES ?? "under_review,in_progress,completed,delivering,delivered,shipped")
      .split(",").map((s) => s.trim()).filter(Boolean);
  },
  get teacherRateSar() { return Number(process.env.TEACHER_RATE_SAR ?? 35); },
  get isProd() { return process.env.NODE_ENV === "production"; },
};
