import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./db";
import { ipHash } from "./request";

export async function audit(
  action: string,
  entity: string,
  entityId: string | null,
  actorId: string | null,
  data: Record<string, unknown> = {},
  client?: PoolClient,
) {
  let ip: string | null = null;
  try { ip = await ipHash(); } catch { /* outside a request (scripts/webhooks) */ }
  await (client ?? pool).query(
    `INSERT INTO audit_log (actor_id, action, entity, entity_id, data, ip_hash) VALUES ($1,$2,$3,$4,$5,$6)`,
    [actorId, action, entity, entityId, JSON.stringify(data), ip],
  );
}
