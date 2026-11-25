/* Creates (or promotes) an admin account.
   ADMIN_EMAIL=... ADMIN_NAME="..." ADMIN_PASSWORD=... npx tsx scripts/create-admin.ts */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { hash } from "@node-rs/argon2";
import { Client } from "pg";

async function main() {
  const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;
  if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_PASSWORD) throw new Error("Set DATABASE_URL, ADMIN_EMAIL, ADMIN_PASSWORD");
  if (ADMIN_PASSWORD.length < 12) throw new Error("Admin password must be at least 12 characters");
  const c = new Client({ connectionString: DATABASE_URL, ssl: /sslmode=require/.test(DATABASE_URL) ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const pw = await hash(ADMIN_PASSWORD, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const { rows } = await c.query(
    `INSERT INTO users (role, status, full_name, email, password_hash) VALUES ('admin','active',$1,$2,$3)
     ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active', password_hash = EXCLUDED.password_hash
     RETURNING id`,
    [ADMIN_NAME ?? "إدارة غِراس", ADMIN_EMAIL.toLowerCase(), pw],
  );
  await c.query(`INSERT INTO audit_log (action, entity, entity_id, data) VALUES ('admin.bootstrap','user',$1,'{}')`, [rows[0].id]);
  console.log("admin ready:", ADMIN_EMAIL);
  await c.end();
}
main().catch((e) => { console.error(e.message); process.exit(1); });
