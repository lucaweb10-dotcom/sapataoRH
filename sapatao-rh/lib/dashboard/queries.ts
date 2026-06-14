import { createClient } from "@/lib/supabase/server";

export type DashboardResumo = {
  candidatos_hoje: number;
  entrevistas_48h: number;
  conversas_abertas: number;
  sla_vencido: number;
};

export type EntrevistaProxima = {
  id: string;
  data_hora: string;
  formato: "presencial" | "online";
  local_ou_link: string | null;
  candidato_nome: string;
  candidato_id: string;
};

export type CandidatoRecente = {
  id: string;
  nome: string;
  telefone: string;
  vaga_interesse: string | null;
  created_at: string;
  conversation_id: string | null;
};

export async function getDashboardResumo(): Promise<DashboardResumo> {
  const supabase = await createClient();
  const agora = new Date();

  const inicioDia = new Date(agora);
  inicioDia.setHours(0, 0, 0, 0);

  const em48h = new Date(agora);
  em48h.setHours(agora.getHours() + 48);

  const [{ count: candidatos_hoje }, { count: entrevistas_48h }, { count: conversas_abertas }] =
    await Promise.all([
      supabase
        .from("candidatos")
        .select("id", { count: "exact", head: true })
        .gte("created_at", inicioDia.toISOString()),
      supabase
        .from("entrevistas")
        .select("id", { count: "exact", head: true })
        .gte("data_hora", agora.toISOString())
        .lte("data_hora", em48h.toISOString()),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("status", "aberta"),
    ]);

  // SLA vencido: candidatos ativos em etapas com sla_dias, cuja etapa_entrou_em expirou
  const [{ data: etapas }, { data: candsSla }] = await Promise.all([
    supabase.from("funil_etapas").select("id, sla_dias").not("sla_dias", "is", null),
    supabase
      .from("candidatos")
      .select("etapa_id, etapa_entrou_em")
      .eq("status", "ativo")
      .not("etapa_entrou_em", "is", null),
  ]);

  const slaMap = new Map((etapas ?? []).map((e) => [e.id, e.sla_dias as number]));
  const sla_vencido = (candsSla ?? []).filter((c) => {
    const dias = c.etapa_id ? slaMap.get(c.etapa_id) : null;
    if (!dias || !c.etapa_entrou_em) return false;
    const limiteMs = dias * 24 * 60 * 60 * 1000;
    return agora.getTime() - new Date(c.etapa_entrou_em).getTime() > limiteMs;
  }).length;

  return {
    candidatos_hoje: candidatos_hoje ?? 0,
    entrevistas_48h: entrevistas_48h ?? 0,
    conversas_abertas: conversas_abertas ?? 0,
    sla_vencido,
  };
}

export async function getEntrevistaProximas(limit = 8): Promise<EntrevistaProxima[]> {
  const supabase = await createClient();
  const agora = new Date();
  const em7d = new Date(agora);
  em7d.setDate(em7d.getDate() + 7);

  const { data: entrevistas } = await supabase
    .from("entrevistas")
    .select("id, data_hora, formato, local_ou_link, candidato_id")
    .gte("data_hora", agora.toISOString())
    .lte("data_hora", em7d.toISOString())
    .order("data_hora")
    .limit(limit);

  if (!entrevistas || entrevistas.length === 0) return [];

  const ids = entrevistas.map((e) => e.candidato_id);
  const { data: candidatos } = await supabase
    .from("candidatos")
    .select("id, nome")
    .in("id", ids);

  const nomeMap = new Map((candidatos ?? []).map((c) => [c.id, c.nome]));

  return entrevistas.map((e) => ({
    id: e.id,
    data_hora: e.data_hora,
    formato: e.formato as "presencial" | "online",
    local_ou_link: e.local_ou_link,
    candidato_nome: nomeMap.get(e.candidato_id) ?? "—",
    candidato_id: e.candidato_id,
  }));
}

export async function getCandidatosRecentes(limit = 8): Promise<CandidatoRecente[]> {
  const supabase = await createClient();

  const { data: candidatos } = await supabase
    .from("candidatos")
    .select("id, nome, telefone, vaga_interesse, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!candidatos || candidatos.length === 0) return [];

  const ids = candidatos.map((c) => c.id);
  const { data: convs } = await supabase
    .from("conversations")
    .select("id, candidato_id")
    .in("candidato_id", ids);

  const convMap = new Map((convs ?? []).map((c) => [c.candidato_id, c.id]));

  return candidatos.map((c) => ({
    id: c.id,
    nome: c.nome,
    telefone: c.telefone,
    vaga_interesse: c.vaga_interesse,
    created_at: c.created_at,
    conversation_id: convMap.get(c.id) ?? null,
  }));
}
