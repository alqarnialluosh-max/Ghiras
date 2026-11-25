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

/** Lazily created so builds without DATABASE_URL still succeed. */
function getPool(): Pool {
  globalThis.__ghirasPool ??= makePool();
  return globalThis.__ghirasPool;
}
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    const p = getPool();
    const v = Reflect.get(p, prop, p);
    return typeof v === "function" ? v.bind(p) : v;
  },
});

/** Parameterized query only — never interpolate user input into SQL. */
export async function q<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await getPool().query<T>(text, params);
  return res.rows;
}

export async function one<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
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
