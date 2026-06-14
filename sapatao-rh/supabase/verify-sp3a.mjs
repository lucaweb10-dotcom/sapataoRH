// Phase A verification (SP3a): ia_criterios + cv_analises tables, RLS, seed.
import { readFileSync } from "node:fs";
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

let fails = 0;
const ok = (label, cond, extra = "") => {
  console.log(`${cond ? "✅" : "❌"} ${label}${extra ? "  " + extra : ""}`);
  if (!cond) fails++;
};

const tbls = (await client.query(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name = any($1)`,
  [["ia_criterios", "cv_analises"]],
)).rows.map((r) => r.table_name);
ok("tabelas ia_criterios/cv_analises existem", tbls.length === 2, tbls.join(","));

const rls = (await client.query(
  `select relname, relrowsecurity from pg_class
   where relname = any($1) and relnamespace='public'::regnamespace`,
  [["ia_criterios", "cv_analises"]],
)).rows;
ok("RLS ON nas duas tabelas", rls.length === 2 && rls.every((r) => r.relrowsecurity),
  rls.map((r) => `${r.relname}:${r.relrowsecurity}`).join(" "));

const emp = (await client.query(`select id from public.empresas where slug='estacao-sapatao'`)).rows[0];
const crit = (await client.query(
  `select prompt_base, criterios, modelo from public.ia_criterios where empresa_id=$1`, [emp.id],
)).rows[0];
ok("ia_criterios seedado p/ a empresa", !!crit && crit.modelo === "mock");
ok("critérios default têm 5 itens", Array.isArray(crit?.criterios) && crit.criterios.length === 5, `(${crit?.criterios?.length})`);

const uq = (await client.query(
  `select 1 from pg_indexes where schemaname='public' and indexname='ia_criterios_empresa_uq'`,
)).rowCount;
ok("unique index ia_criterios_empresa_uq existe", uq === 1);

await client.end();
console.log(fails === 0 ? "\nSP3a Phase A: TODOS OS CHECKS PASSARAM ✅" : `\nSP3a Phase A: ${fails} FALHA(S) ❌`);
process.exit(fails === 0 ? 0 : 1);
