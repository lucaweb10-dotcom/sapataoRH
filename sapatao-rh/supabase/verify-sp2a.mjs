// Phase A verification (SP2): tables, etapas, RLS, realtime, placement trigger.
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

// 1) tables exist
const tbls = (await client.query(
  `select table_name from information_schema.tables
   where table_schema='public' and table_name = any($1)`,
  [["funis", "funil_etapas", "kanban_history"]],
)).rows.map((r) => r.table_name);
ok("tabelas funis/funil_etapas/kanban_history existem", tbls.length === 3, tbls.join(","));

// 2) candidatos novas colunas
const cols = (await client.query(
  `select column_name from information_schema.columns
   where table_schema='public' and table_name='candidatos' and column_name = any($1)`,
  [["etapa_id", "etapa_entrou_em"]],
)).rows.map((r) => r.column_name);
ok("candidatos.etapa_id + etapa_entrou_em existem", cols.length === 2, cols.join(","));

// 3) RLS habilitado nas 3 tabelas
const rls = (await client.query(
  `select relname, relrowsecurity from pg_class
   where relname = any($1) and relnamespace = 'public'::regnamespace`,
  [["funis", "funil_etapas", "kanban_history"]],
)).rows;
ok("RLS ON em funis/funil_etapas/kanban_history", rls.length === 3 && rls.every((r) => r.relrowsecurity),
  rls.map((r) => `${r.relname}:${r.relrowsecurity}`).join(" "));

// 4) candidatos no realtime publication
const pub = (await client.query(
  `select 1 from pg_publication_tables where pubname='supabase_realtime'
   and schemaname='public' and tablename='candidatos'`,
)).rowCount;
ok("candidatos na publication supabase_realtime", pub === 1);

// 5) trigger de placement existe
const trg = (await client.query(
  `select 1 from pg_trigger where tgname='candidatos_place_funil' and not tgisinternal`,
)).rowCount;
ok("trigger candidatos_place_funil existe", trg === 1);

// 6) 10 etapas na ordem certa
const emp = (await client.query(`select id from public.empresas where slug='estacao-sapatao'`)).rows[0];
const etapas = (await client.query(
  `select fe.nome, fe.ordem, fe.is_terminal, fe.status_destino
   from public.funil_etapas fe join public.funis f on f.id=fe.funil_id
   where f.empresa_id=$1 and f.is_default order by fe.ordem`,
  [emp.id],
)).rows;
ok("funil padrão tem 10 etapas", etapas.length === 10, `(${etapas.length})`);
ok("1ª etapa = Novo Lead", etapas[0]?.nome === "Novo Lead", etapas[0]?.nome);
const terminais = etapas.filter((e) => e.is_terminal).map((e) => e.status_destino).sort();
ok("3 terminais com status_destino", terminais.length === 3, terminais.join(","));

// 7) trigger funciona: insere candidato sem etapa -> cai na 1ª etapa
const primeira = etapas[0];
const ins = (await client.query(
  `insert into public.candidatos(empresa_id, nome, telefone, origem)
   values($1,'__verify_sp2a__','000verify',  'verify') returning id, etapa_id, etapa_entrou_em`,
  [emp.id],
)).rows[0];
const placed = (await client.query(
  `select fe.nome from public.funil_etapas fe where fe.id=$1`, [ins.etapa_id],
)).rows[0];
ok("trigger colocou novo candidato na 1ª etapa", placed?.nome === "Novo Lead" && ins.etapa_entrou_em != null, placed?.nome);
await client.query(`delete from public.candidatos where id=$1`, [ins.id]);

// 8) backfill: nenhum candidato ativo sem etapa
const semEtapa = (await client.query(
  `select count(*)::int n from public.candidatos where empresa_id=$1 and etapa_id is null`, [emp.id],
)).rows[0].n;
ok("nenhum candidato sem etapa (backfill)", semEtapa === 0, `(${semEtapa} sem etapa)`);

await client.end();
console.log(fails === 0 ? "\nPhase A: TODOS OS CHECKS PASSARAM ✅" : `\nPhase A: ${fails} CHECK(S) FALHARAM ❌`);
process.exit(fails === 0 ? 0 : 1);
