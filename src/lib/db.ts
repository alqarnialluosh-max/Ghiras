import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { env } from "./env";

declare global {
  var __ghirasPool: Pool | undefined;
}

function makePool() {
  const url = env.databaseUrl;
  const needsSsl = /sslmode=require/.test(url) || process.env.DATABASE_SSL === "true";
  return new Pool({
    connectionString: url,
    max: 10,
    idleTimeoutMillis: 30_000,
    ssl: needsSsl ? { rejectUnauthorized: false } : undefined,
  });
}

export const pool: Pool = globalThis.__ghirasPool ?? makePool();
if (!env.isProd) globalThis.__ghirasPool = pool;

/** Parameterized query only — never interpolate user input into SQL. */
export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

/** Postgres error helpers */
export function isExclusionViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23P01";
}
export function isUniqueViolation(e: unknown) {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";
}
