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

  const [{ data: etapas }, { data: candidatos }] = await Promise.all([
    supabase.from("funil_etapas").select("id, nome, cor, ordem, sla_dias").order("ordem"),
    supabase
      .from("candidatos")
      .select("etapa_id, etapa_entrou_em")
      .eq("status", "ativo"),
  ]);

  const totalAtivos = (candidatos ?? []).length;
  const porEtapa = new Map<string, { etapa_entrou_em: string | null }[]>();
  for (const c of candidatos ?? []) {
    if (!c.etapa_id) continue;
    const lista = porEtapa.get(c.etapa_id) ?? [];
    lista.push({ etapa_entrou_em: c.etapa_entrou_em ?? null });
    porEtapa.set(c.etapa_id, lista);
  }

  const agora = new Date();
  return (etapas ?? []).map((e) => {
    const grupo = porEtapa.get(e.id) ?? [];
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
  });
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
