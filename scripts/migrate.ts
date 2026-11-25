/* Applies db/migrations/*.sql in order, exactly once each, inside a transaction. */
import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { hash } from "@node-rs/argon2";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => /^\d+_.+\.sql$/.test(f)).sort();
  const { rows } = await client.query<{ name: string }>("SELECT name FROM schema_migrations");
  const done = new Set(rows.map((r) => r.name));

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = readFileSync(join(dir, file), "utf8");
    process.stdout.write(`→ applying ${file} ... `);
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log("ok");
    } catch (e) {
      await client.query("ROLLBACK");
      console.log("FAILED");
      throw e;
    }
  }
  console.log("migrations up to date");

  // One-time owner bootstrap: only runs when NO admin exists yet.
  const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const pw = process.env.OWNER_PASSWORD;
  if (email && pw) {
    const { rows: admins } = await client.query("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length) {
      console.log("owner bootstrap skipped (an owner already exists) — you can clear OWNER_PASSWORD");
    } else if (pw.length < 12) {
      console.log("owner bootstrap skipped: OWNER_PASSWORD must be at least 12 characters");
    } else {
      const ph = await hash(pw, { memoryCost: 19456, timeCost: 2, parallelism: 1 });
      const { rows } = await client.query(
        `INSERT INTO users (role, status, full_name, email, password_hash) VALUES ('admin','active',$1,$2,$3)
         ON CONFLICT (email) DO UPDATE SET role = 'admin', status = 'active', password_hash = EXCLUDED.password_hash
         RETURNING id`,
        [process.env.OWNER_NAME || "مالك غِراس", email, ph],
      );
      await client.query(`INSERT INTO audit_log (action, entity, entity_id, data) VALUES ('owner.bootstrap','user',$1,'{}')`, [rows[0].id]);
      console.log("owner account created:", email);
    }
  }
  await client.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
