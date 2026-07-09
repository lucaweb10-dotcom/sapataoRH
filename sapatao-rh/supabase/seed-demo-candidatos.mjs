// Demo candidates for the Funil/Kanban (idempotent by telefone).
// Separate from the core bootstrap (seed.mjs) — run on demand:
//   npm run seed:demo
// Uses the service role (bypasses RLS). Reads secrets from .env.local.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(Date.now() - ms).toISOString();

// nome, vaga, etapa (nome), score (null = sem análise), tags, horas/dias na etapa, idade
const DEMO = [
  { nome: "Marina Alves",       vaga: "Atendente de loja", etapa: "Novo Lead",            score: null, tags: ["CLT", "Manhã"],      entrou: 2 * HOUR,  idade: 24 },
  { nome: "João Pedro Ramos",   vaga: "Frentista",         etapa: "Novo Lead",            score: null, tags: ["Noturno"],            entrou: 35 * 60 * 1000, idade: 21 },
  { nome: "Bianca Rocha",       vaga: "Caixa",             etapa: "Novo Lead",            score: null, tags: [],                     entrou: 5 * HOUR,  idade: 29 },
  { nome: "Rafael Costa",       vaga: "Frentista",         etapa: "Triagem Inicial",      score: null, tags: ["Tem veículo"],        entrou: 1 * DAY,   idade: 33 },
  { nome: "Camila Nunes",       vaga: "Cozinha",           etapa: "Triagem Inicial",      score: null, tags: ["Tarde"],              entrou: 2 * DAY,   idade: 27 },
  { nome: "Diego Martins",      vaga: "Estoquista",        etapa: "Currículo Recebido",   score: null, tags: ["PCD"],                entrou: 1 * DAY,   idade: 38 },
  { nome: "Letícia Souza",      vaga: "Atendente de loja", etapa: "Currículo Recebido",   score: null, tags: [],                     entrou: 6 * HOUR,  idade: 22 },
  { nome: "Júlia Fernandes",    vaga: "Caixa",             etapa: "Análise IA Concluída", score: 88,   tags: ["Experiência", "CLT"], entrou: 3 * HOUR,  idade: 31 },
  { nome: "André Lima",         vaga: "Frentista",         etapa: "Análise IA Concluída", score: 64,   tags: ["Noturno"],            entrou: 1 * DAY,   idade: 26 },
  { nome: "Sandra Dias",        vaga: "Cozinha",           etapa: "Análise IA Concluída", score: 38,   tags: [],                     entrou: 8 * HOUR,  idade: 44 },
  { nome: "Patrícia Gomes",     vaga: "Supervisora",       etapa: "Apto p/ Entrevista",   score: 91,   tags: ["Liderança", "Pleno"], entrou: 4 * HOUR,  idade: 36 },
  { nome: "Bruno Carvalho",     vaga: "Lavador",           etapa: "Entrevista Agendada",  score: 73,   tags: ["Tarde"],              entrou: 2 * DAY,   idade: 23 },
  { nome: "Tânia Ribeiro",      vaga: "Caixa",             etapa: "Aprovado p/ Gestor",   score: 95,   tags: ["Pleno", "Experiência"], entrou: 1 * DAY, idade: 40 },
];

async function main() {
  const { data: empresa } = await admin
    .from("empresas").select("id").eq("slug", "estacao-sapatao").maybeSingle();
  if (!empresa) throw new Error("Empresa 'estacao-sapatao' não encontrada. Rode `npm run seed` antes.");

  const { data: unidade } = await admin
    .from("unidades").select("id").eq("empresa_id", empresa.id).eq("nome", "Novo Hamburgo").maybeSingle();

  const { data: funil } = await admin
    .from("funis").select("id").eq("empresa_id", empresa.id).eq("is_default", true).maybeSingle();
  if (!funil) throw new Error("Funil padrão não encontrado. Rode `npm run seed` antes.");

  const { data: etapas } = await admin
    .from("funil_etapas").select("id, nome").eq("funil_id", funil.id);
  const etapaId = Object.fromEntries((etapas ?? []).map((e) => [e.nome, e.id]));

  let inseridos = 0, pulados = 0;
  for (let i = 0; i < DEMO.length; i++) {
    const d = DEMO[i];
    const telefone = `555199000${String(i + 1).padStart(4, "0")}`; // fake, único, idempotente
    const etapa_id = etapaId[d.etapa];
    if (!etapa_id) { console.warn(`etapa não encontrada: ${d.etapa} — pulando ${d.nome}`); continue; }

    const { data: existe } = await admin
      .from("candidatos").select("id").eq("empresa_id", empresa.id).eq("telefone", telefone).maybeSingle();
    if (existe) { pulados++; continue; }

    const { error } = await admin.from("candidatos").insert({
      empresa_id: empresa.id,
      nome: d.nome,
      telefone,
      vaga_interesse: d.vaga,
      unidade_id: unidade?.id ?? null,
      score_ia: d.score,
      tags: d.tags,
      idade: d.idade,
      origem: "manual",
      status: "ativo",
      etapa_id,
      etapa_entrou_em: ago(d.entrou),
    });
    if (error) { console.error(`erro ao inserir ${d.nome}:`, error.message); continue; }
    inseridos++;
  }

  console.log(`Demo de candidatos: ${inseridos} inseridos, ${pulados} já existiam (idempotente).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
