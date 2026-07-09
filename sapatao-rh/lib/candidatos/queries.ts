import { createClient } from "@/lib/supabase/server";
import type { Candidato } from "@/types/database";
import { buscaOr, type FiltrosCandidatos } from "./filtros";
import { rangeDaPagina } from "@/lib/shared/paginacao";

/** Row of the /candidatos table (RLS-scoped to the empresa). */
export type CandidatoLista = Pick<
  Candidato,
  | "id"
  | "nome"
  | "telefone"
  | "vaga_interesse"
  | "etapa_id"
  | "score_ia"
  | "status"
  | "avatar_url"
  | "updated_at"
>;

export type ListaCandidatos = { rows: CandidatoLista[]; total: number };

/** Full candidato record for the ficha page, plus its conversation id. */
export type CandidatoFicha = Candidato & { conversationId: string | null };

const LISTA_COLS =
  "id, nome, telefone, vaga_interesse, etapa_id, score_ia, status, avatar_url, updated_at";

/** Paginated, filtered candidato listing ordered by latest activity. */
export async function listCandidatos(filtros: FiltrosCandidatos): Promise<ListaCandidatos> {
  const supabase = await createClient();

  let query = supabase
    .from("candidatos")
    .select(LISTA_COLS, { count: "exact" })
    .order("updated_at", { ascending: false });

  const or = buscaOr(filtros.q);
  if (or) query = query.or(or);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.etapaId) query = query.eq("etapa_id", filtros.etapaId);

  const { from, to } = rangeDaPagina(filtros.page);
  const { data, error, count } = await query.range(from, to);

  if (error) {
    console.error("[candidatos/queries] listCandidatos error:", error);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as unknown as CandidatoLista[], total: count ?? 0 };
}

/** Loads one candidato with its conversation id; null if missing / not visible via RLS. */
export async function getCandidatoFicha(id: string): Promise<CandidatoFicha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidatos")
    .select("*, conversations(id)")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("[candidatos/queries] getCandidatoFicha error:", error);
    return null;
  }
  if (!data) return null;

  type Row = Candidato & { conversations: { id: string }[] | null };
  const { conversations, ...rest } = data as unknown as Row;
  return { ...(rest as Candidato), conversationId: conversations?.[0]?.id ?? null };
}

/** Most recent entrevista for the candidato (the current one), if any. */
export async function getEntrevistaVigente(candidatoId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("entrevistas")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error("[candidatos/queries] getEntrevistaVigente error:", error);
    return null;
  }
  return data;
}
