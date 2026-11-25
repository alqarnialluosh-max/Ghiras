import "server-only";
import { one } from "./db";

/**
 * Fixed-window limiter stored in Postgres so it works across multiple instances.
 * Returns true when the action is allowed.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const row = await one<{ hits: number }>(
    `INSERT INTO rate_limits (key, hits, reset_at)
       VALUES ($1, 1, now() + make_interval(secs => $2))
     ON CONFLICT (key) DO UPDATE SET
       hits     = CASE WHEN rate_limits.reset_at < now() THEN 1 ELSE rate_limits.hits + 1 END,
       reset_at = CASE WHEN rate_limits.reset_at < now() THEN now() + make_interval(secs => $2) ELSE rate_limits.reset_at END
     RETURNING hits`,
    [key, windowSeconds],
  );
  return (row?.hits ?? 0) <= limit;
}
