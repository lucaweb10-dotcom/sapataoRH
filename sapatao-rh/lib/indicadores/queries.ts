import { createClient } from "@/lib/supabase/server";
import {
  cutoffDoPeriodo,
  agruparPorSemana,
  calcularSlaStatus,
  media,
  type PeriodoFiltro,
} from "./calculos";

export type { PeriodoFiltro };

export type ResumoIndicadores = {
  ativos: number;
  contratados: number;
  reprovados: number;
  desistentes: number;
  score_medio: number | null;
};

export type EtapaSnapshot = {
  id: string;
  nome: string;
  cor: string;
  ordem: number;
  sla_dias: number | null;
  total: number;
  pct: number; // % do total de ativos
  sla_dentro: number;
  sla_fora: number;
};

export type SemanaEntry = {
  rotulo: string;
  count: number;
};

export async function getResumoIndicadores(periodo: PeriodoFiltro): Promise<ResumoIndicadores> {
  const supabase = await createClient();
  const agora = new Date();
  const cutoff = cutoffDoPeriodo(periodo, agora);

  let query = supabase.from("candidatos").select("status, score_ia");
  if (cutoff) query = query.gte("created_at", cutoff.toISOString());

  const { data } = await query;
  const rows = data ?? [];

  return {
    ativos: rows.filter((r) => r.status === "ativo").length,
    contratados: rows.filter((r) => r.status === "contratado").length,
    reprovados: rows.filter((r) => r.status === "reprovado").length,
    desistentes: rows.filter((r) => r.status === "desistente").length,
    score_medio: media(rows.map((r) => r.score_ia ?? null)),
  };
}

export async function getSnapshotFunil(): Promise<EtapaSnapshot[]> {
  const supabase = await createClient();

  // SP7 (funis por unidade): o snapshot é da EMPRESA — agrega candidatos de
  // todos os funis POR NOME de etapa, usando as etapas do funil Geral como
  // linhas canônicas (ordem/cor/SLA). Etapas exclusivas de funis de unidade
  // (renomeadas) entram como linhas extras no fim.
  const [{ data: funis }, { data: etapas }, { data: candidatos }] = await Promise.all([
    supabase.from("funis").select("id, is_default"),
    supabase.from("funil_etapas").select("id, nome, cor, ordem, sla_dias, funil_id").order("ordem"),
    supabase.from("candidatos").select("etapa_id, etapa_entrou_em").eq("status", "ativo"),
  ]);

  const normalizar = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  const defaultFunilId = (funis ?? []).find((f) => f.is_default)?.id ?? null;
  const todas = etapas ?? [];
  // dedup por nome NORMALIZADO também nas canônicas (nomes homônimos no Geral
  // contariam o mesmo grupo duas vezes)
  const vistosCanonicos = new Set<string>();
  const canonicas = (defaultFunilId ? todas.filter((e) => e.funil_id === defaultFunilId) : todas).filter(
    (e) => {
      const chave = normalizar(e.nome);
      if (vistosCanonicos.has(chave)) return false;
      vistosCanonicos.add(chave);
      return true;
    },
  );

  const nomePorEtapaId = new Map<string, string>();
  for (const e of todas) nomePorEtapaId.set(e.id, normalizar(e.nome));

  const totalAtivos = (candidatos ?? []).length;
  const porNome = new Map<string, { etapa_entrou_em: string | null }[]>();
  for (const c of candidatos ?? []) {
    if (!c.etapa_id) continue;
    const nome = nomePorEtapaId.get(c.etapa_id);
    if (!nome) continue;
    const lista = porNome.get(nome) ?? [];
    lista.push({ etapa_entrou_em: c.etapa_entrou_em ?? null });
    porNome.set(nome, lista);
  }

  const agora = new Date();
  const linha = (e: { id: string; nome: string; cor: string; ordem: number; sla_dias: number | null }) => {
    const grupo = porNome.get(normalizar(e.nome)) ?? [];
    const total = grupo.length;
    const sla = calcularSlaStatus(
      grupo.map((g) => g.etapa_entrou_em),
      e.sla_dias,
      agora,
    );
    return {
      id: e.id,
      nome: e.nome,
      cor: e.cor,
      ordem: e.ordem,
      sla_dias: e.sla_dias,
      total,
      pct: totalAtivos > 0 ? Math.round((total / totalAtivos) * 100) : 0,
      sla_dentro: sla.dentro,
      sla_fora: sla.fora,
    };
  };

  const nomesCanonicos = new Set(canonicas.map((e) => normalizar(e.nome)));
  const extras = todas.filter(
    (e) => !nomesCanonicos.has(normalizar(e.nome)) && (porNome.get(normalizar(e.nome)) ?? []).length > 0,
  );
  // dedup extras por nome normalizado (fica a 1ª ocorrência)
  const vistos = new Set<string>();
  const extrasUnicas = extras.filter((e) => {
    const chave = normalizar(e.nome);
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });

  return [
    ...canonicas.map(linha),
    ...extrasUnicas.map((e, i) => ({ ...linha(e), ordem: 1000 + i })),
  ];
}

export async function getEntradasSemanais(nSemanas = 8): Promise<SemanaEntry[]> {
  const supabase = await createClient();
  const agora = new Date();
  const desde = new Date(agora);
  desde.setDate(desde.getDate() - nSemanas * 7);

  const { data } = await supabase
    .from("candidatos")
    .select("created_at")
    .gte("created_at", desde.toISOString());

  return agruparPorSemana(
    (data ?? []).map((r) => r.created_at),
    nSemanas,
    agora,
  );
}
