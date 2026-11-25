/* Applies db/migrations/*.sql in order, exactly once each, inside a transaction. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

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
  await client.end();
  console.log("migrations up to date");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
