import { somenteDigitos, textoIlikeSeguro } from "@/lib/shared/busca";
import type { FuncionarioStatus } from "@/types/database";

export const STATUS_FUNCIONARIO: FuncionarioStatus[] = ["ativo", "inativo", "afastado"];

export type FiltrosFuncionarios = {
  /** Busca por nome, cargo ou CPF (aparada). Vazia = sem busca. */
  q: string;
  /** null = todos; default do módulo é 'ativo' (quadro atual). */
  status: FuncionarioStatus | null;
  unidadeId: string | null;
  /** 1-based. */
  page: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalizes /funcionarios searchParams. Sem `status` na URL = 'ativo'
 *  (o RH gerencia o quadro atual); `status=todos` = sem filtro. */
export function parseFiltros(
  sp: Record<string, string | string[] | undefined>,
): FiltrosFuncionarios {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const q = (one(sp.q) ?? "").trim().slice(0, 80);

  const statusRaw = one(sp.status);
  let status: FuncionarioStatus | null;
  if (statusRaw === "todos") status = null;
  else if (STATUS_FUNCIONARIO.includes(statusRaw as FuncionarioStatus))
    status = statusRaw as FuncionarioStatus;
  else status = "ativo";

  const unidadeRaw = one(sp.unidade);
  const unidadeId = unidadeRaw && UUID_RE.test(unidadeRaw) ? unidadeRaw : null;

  const pageRaw = Number.parseInt(one(sp.p) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, status, unidadeId, page };
}

/** PostgREST or() matching nome_completo/cargo (texto) e cpf (dígitos). */
export function buscaOr(q: string): string | null {
  const texto = textoIlikeSeguro(q);
  const digitos = somenteDigitos(q);

  const partes: string[] = [];
  if (texto.length > 0) {
    partes.push(`nome_completo.ilike.*${texto}*`, `cargo.ilike.*${texto}*`);
  }
  if (digitos.length >= 3) partes.push(`cpf.ilike.*${digitos}*`);
  if (partes.length === 0) return null;
  return partes.join(",");
}
