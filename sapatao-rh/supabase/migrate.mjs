// Minimal migration runner: applies supabase/migrations/*.sql in order against
// SUPABASE_DB_URL, tracking applied files in public._migrations (idempotent).
// Used instead of the Supabase CLI to avoid interactive login/prompts on Windows.
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const dir = path.dirname(fileURLToPath(import.meta.url));

for (const line of readFileSync(path.join(dir, "..", ".env.local"), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const client = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL });
await client.connect();

await client.query(`create table if not exists public._migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);

const applied = new Set(
  (await client.query("select name from public._migrations")).rows.map((r) => r.name),
);

const files = readdirSync(path.join(dir, "migrations"))
  .filter((f) => f.endsWith(".sql"))
  .sort();

for (const file of files) {
  if (applied.has(file)) {
    console.log("skip ", file);
    continue;
  }
  const sql = readFileSync(path.join(dir, "migrations", file), "utf8");
  process.stdout.write(`apply ${file} ... `);
  try {
    await client.query("begin");
    await client.query(sql);
    await client.query("insert into public._migrations(name) values($1)", [file]);
    await client.query("commit");
    console.log("OK");
  } catch (e) {
    await client.query("rollback");
    console.error("FAIL\n", e.message);
    await client.end();
    process.exit(1);
  }
}

await client.end();
console.log("migrations done");
