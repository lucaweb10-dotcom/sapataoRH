import { createClient } from "@/lib/supabase/server";
import { rangeDaPagina } from "@/lib/shared/paginacao";
import type { Funcionario, FuncionarioOcorrencia, Unidade } from "@/types/database";
import { buscaOr, type FiltrosFuncionarios } from "./filtros";
import type { FuncionarioCsvRow } from "./csv";

/** Row of the /funcionarios table (RLS-scoped). */
export type FuncionarioLista = Pick<
  Funcionario,
  "id" | "nome_completo" | "cpf" | "cargo" | "unidade_id" | "data_admissao" | "status"
>;

export type ListaFuncionarios = { rows: FuncionarioLista[]; total: number };

const LISTA_COLS = "id, nome_completo, cpf, cargo, unidade_id, data_admissao, status";

/** Paginated, filtered listing ordered by nome. */
export async function listFuncionarios(filtros: FiltrosFuncionarios): Promise<ListaFuncionarios> {
  const supabase = await createClient();

  let query = supabase
    .from("funcionarios")
    .select(LISTA_COLS, { count: "exact" })
    .order("nome_completo", { ascending: true });
  const or = buscaOr(filtros.q);
  if (or) query = query.or(or);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.unidadeId) query = query.eq("unidade_id", filtros.unidadeId);

  const { from, to } = rangeDaPagina(filtros.page);
  const { data, error, count } = await query.range(from, to);
  if (error) {
    console.error("[funcionarios/queries] listFuncionarios error:", error);
    return { rows: [], total: 0 };
  }
  return { rows: (data ?? []) as unknown as FuncionarioLista[], total: count ?? 0 };
}

/** Every row matching the filters (sem paginação) com nome da unidade — p/ CSV. */
export async function listFuncionariosCsv(
  filtros: FiltrosFuncionarios,
): Promise<FuncionarioCsvRow[]> {
  const supabase = await createClient();

  let query = supabase
    .from("funcionarios")
    .select("*, unidades(nome)")
    .order("nome_completo", { ascending: true });
  const or = buscaOr(filtros.q);
  if (or) query = query.or(or);
  if (filtros.status) query = query.eq("status", filtros.status);
  if (filtros.unidadeId) query = query.eq("unidade_id", filtros.unidadeId);

  const { data, error } = await query;
  if (error) {
    console.error("[funcionarios/queries] listFuncionariosCsv error:", error);
    return [];
  }
  type Row = Funcionario & { unidades: { nome: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { unidades, ...rest } = r;
    return { ...rest, unidade_nome: unidades?.nome ?? null };
  });
}

export type FuncionarioFicha = Funcionario & {
  unidade_nome: string | null;
  candidato_nome: string | null;
};

/** One funcionário with unidade + candidato de origem; null if not visible. */
export async function getFuncionario(id: string): Promise<FuncionarioFicha | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funcionarios")
    .select("*, unidades(nome), candidatos(nome)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[funcionarios/queries] getFuncionario error:", error);
    return null;
  }
  if (!data) return null;
  type Row = Funcionario & {
    unidades: { nome: string } | null;
    candidatos: { nome: string } | null;
  };
  const { unidades, candidatos, ...rest } = data as unknown as Row;
  return {
    ...(rest as Funcionario),
    unidade_nome: unidades?.nome ?? null,
    candidato_nome: candidatos?.nome ?? null,
  };
}

/** Ocorrências do funcionário (mais recentes primeiro) com autor. */
export type OcorrenciaComAutor = FuncionarioOcorrencia & { registrado_por_nome: string | null };

export async function listOcorrencias(funcionarioId: string): Promise<OcorrenciaComAutor[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funcionario_ocorrencias")
    .select("*, profiles(nome)")
    .eq("funcionario_id", funcionarioId)
    .order("data", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) {
    console.error("[funcionarios/queries] listOcorrencias error:", error);
    return [];
  }
  type Row = FuncionarioOcorrencia & { profiles: { nome: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { profiles, ...rest } = r;
    return { ...rest, registrado_por_nome: profiles?.nome ?? null };
  });
}

/** Unidades ativas da empresa (p/ selects de filtro e formulário). */
export async function listUnidades(): Promise<Unidade[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .select("*")
    .eq("ativa", true)
    .order("nome", { ascending: true });
  if (error) {
    console.error("[funcionarios/queries] listUnidades error:", error);
    return [];
  }
  return (data ?? []) as Unidade[];
}

/** Funcionário criado a partir de um candidato (se existir). */
export async function getFuncionarioDoCandidato(
  candidatoId: string,
): Promise<{ id: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("funcionarios")
    .select("id")
    .eq("candidato_origem_id", candidatoId)
    .maybeSingle();
  return (data as { id: string } | null) ?? null;
}
