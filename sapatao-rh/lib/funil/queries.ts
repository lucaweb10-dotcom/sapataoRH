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
  type Row = Omit<HistoricoEntry, "movido_por_nome"> & { profiles: { nome: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { profiles, ...rest } = r;
    return { ...rest, movido_por_nome: profiles?.nome ?? null };
  });
}
