import { createClient } from "@/lib/supabase/server";
import { buscaOr } from "@/lib/candidatos/filtros";
import type { Candidato, Funil, FunilEtapa } from "@/types/database";

export type FunilComEtapas = { funil: Funil; etapas: FunilEtapa[] };

/** A candidato projection for board cards + modal (RLS-scoped to the empresa). */
export type CandidatoFunil = Pick<
  Candidato,
  | "id"
  | "nome"
  | "telefone"
  | "cep"
  | "idade"
  | "endereco"
  | "vaga_interesse"
  | "score_ia"
  | "parecer_ia"
  | "tags"
  | "etapa_id"
  | "etapa_entrou_em"
  | "avatar_url"
  | "unidade_id"
  | "notas_internas"
  | "status"
  | "atribuido_a"
> & { conversationId: string | null };

export type HistoricoEntry = {
  id: string;
  de_etapa: string | null;
  para_etapa: string | null;
  /** Nomes resolvidos server-side em QUALQUER funil (SP7 — migração entre funis). */
  de_etapa_nome: string | null;
  para_etapa_nome: string | null;
  observacao: string | null;
  created_at: string;
  movido_por_nome: string | null;
};

/** Returns the empresa's default (or given) funil plus its etapas, ordered. */
export async function getFunilComEtapas(funilId?: string): Promise<FunilComEtapas | null> {
  const supabase = await createClient();

  let funilQuery = supabase.from("funis").select("*");
  funilQuery = funilId ? funilQuery.eq("id", funilId) : funilQuery.eq("is_default", true);
  const { data: funil, error: fErr } = await funilQuery.maybeSingle<Funil>();
  if (fErr || !funil) {
    if (fErr) console.error("[funil/queries] getFunilComEtapas funil error:", fErr);
    return null;
  }

  const { data: etapas, error: eErr } = await supabase
    .from("funil_etapas")
    .select("*")
    .eq("funil_id", funil.id)
    .order("ordem", { ascending: true });
  if (eErr) {
    console.error("[funil/queries] getFunilComEtapas etapas error:", eErr);
    return { funil, etapas: [] };
  }
  return { funil, etapas: (etapas ?? []) as FunilEtapa[] };
}

export type FunilResumo = Pick<Funil, "id" | "nome" | "is_default" | "unidade_id"> & {
  unidadeNome: string | null;
};

/** Todos os funis ativos da empresa (Geral primeiro, depois por nome da unidade). */
export async function listFunis(): Promise<FunilResumo[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funis")
    .select("id, nome, is_default, unidade_id, unidades(nome)")
    .eq("ativo", true);
  if (error) {
    console.error("[funil/queries] listFunis error:", error);
    return [];
  }
  type Row = Pick<Funil, "id" | "nome" | "is_default" | "unidade_id"> & {
    unidades: { nome: string } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map(({ unidades, ...rest }) => ({ ...rest, unidadeNome: unidades?.nome ?? null }))
    .sort((a, b) => {
      if (a.is_default !== b.is_default) return a.is_default ? -1 : 1;
      return (a.unidadeNome ?? a.nome).localeCompare(b.unidadeNome ?? b.nome);
    });
}

/** Funil da unidade (se ela tiver um próprio e ativo); senão o Geral (default). */
export async function getFunilDaUnidade(unidadeId: string | null): Promise<FunilComEtapas | null> {
  if (unidadeId) {
    const supabase = await createClient();
    const { data: funil } = await supabase
      .from("funis")
      .select("*")
      .eq("unidade_id", unidadeId)
      .eq("ativo", true)
      .maybeSingle<Funil>();
    if (funil) return getFunilComEtapas(funil.id);
  }
  return getFunilComEtapas();
}

/** O funil ONDE o candidato está: o dono da etapa dele; sem etapa → o funil
 *  da unidade dele; sem ambos → o Geral. Usado por telas que mostram/movem a
 *  etapa de UM candidato (painel do chat, ficha). */
export async function getFunilDoCandidato(
  etapaId: string | null,
  unidadeId: string | null,
): Promise<FunilComEtapas | null> {
  if (etapaId) {
    const supabase = await createClient();
    const { data: etapa } = await supabase
      .from("funil_etapas")
      .select("funil_id")
      .eq("id", etapaId)
      .maybeSingle();
    if (etapa?.funil_id) return getFunilComEtapas(etapa.funil_id);
  }
  return getFunilDaUnidade(unidadeId);
}

/** Todas as etapas da empresa (todos os funis) — p/ resolver nome/cor de etapas
 *  de candidatos espalhados por vários funis (lista/ficha/histórico). */
export async function listTodasEtapas(): Promise<FunilEtapa[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funil_etapas")
    .select("*")
    .order("ordem", { ascending: true });
  if (error) {
    console.error("[funil/queries] listTodasEtapas error:", error);
    return [];
  }
  return (data ?? []) as FunilEtapa[];
}

export type FiltrosBoard = {
  q?: string;
  vaga?: string | null;
  respId?: string | null;
  unidadeId?: string | null;
};

/** Returns candidatos whose etapa_id is one of `etapaIds` (RLS-scoped), com
 *  filtros server-side de busca/vaga/responsável/unidade (spec SP6 §6).
 *  Embeds the candidato's conversation id. */
export async function listCandidatosDoFunil(
  etapaIds: string[],
  filtros: FiltrosBoard = {},
): Promise<CandidatoFunil[]> {
  if (etapaIds.length === 0) return [];
  const supabase = await createClient();

  let query = supabase
    .from("candidatos")
    .select(
      "id, nome, telefone, cep, idade, endereco, vaga_interesse, score_ia, parecer_ia, tags, etapa_id, etapa_entrou_em, avatar_url, unidade_id, notas_internas, status, atribuido_a, conversations(id)",
    )
    .in("etapa_id", etapaIds)
    .order("etapa_entrou_em", { ascending: true, nullsFirst: true });

  const or = filtros.q ? buscaOr(filtros.q) : null;
  if (or) query = query.or(or);
  if (filtros.vaga) query = query.eq("vaga_interesse", filtros.vaga);
  if (filtros.respId) query = query.eq("atribuido_a", filtros.respId);
  if (filtros.unidadeId) query = query.eq("unidade_id", filtros.unidadeId);

  const { data, error } = await query;
  if (error) {
    console.error("[funil/queries] listCandidatosDoFunil error:", error);
    return [];
  }

  type Row = Omit<CandidatoFunil, "conversationId"> & { conversations: { id: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { conversations, ...rest } = r;
    return { ...rest, conversationId: conversations?.[0]?.id ?? null };
  });
}

/** Returns the kanban move history for a candidato (newest first), with the
 *  name of who moved it. Etapa names are resolved by the caller via the funil etapas. */
export async function getHistorico(candidatoId: string): Promise<HistoricoEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kanban_history")
    .select("id, de_etapa, para_etapa, observacao, created_at, profiles(nome)")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[funil/queries] getHistorico error:", error);
    return [];
  }
  type Row = Omit<HistoricoEntry, "movido_por_nome" | "de_etapa_nome" | "para_etapa_nome"> & {
    profiles: { nome: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  // Resolve nomes de etapa de QUALQUER funil (migração de unidade cruza funis).
  const ids = [...new Set(rows.flatMap((r) => [r.de_etapa, r.para_etapa]).filter((v): v is string => !!v))];
  const nomes = new Map<string, string>();
  if (ids.length > 0) {
    const { data: etapas } = await supabase.from("funil_etapas").select("id, nome").in("id", ids);
    for (const e of etapas ?? []) nomes.set(e.id, e.nome);
  }

  return rows.map((r) => {
    const { profiles, ...rest } = r;
    return {
      ...rest,
      de_etapa_nome: r.de_etapa ? (nomes.get(r.de_etapa) ?? null) : null,
      para_etapa_nome: r.para_etapa ? (nomes.get(r.para_etapa) ?? null) : null,
      movido_por_nome: profiles?.nome ?? null,
    };
  });
}
