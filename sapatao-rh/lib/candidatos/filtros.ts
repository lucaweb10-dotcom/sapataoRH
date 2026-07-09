import type { Candidato } from "@/types/database";

export type StatusCandidato = Candidato["status"];

export const STATUS_VALIDOS: StatusCandidato[] = [
  "ativo",
  "contratado",
  "reprovado",
  "desistente",
];

export type FiltrosCandidatos = {
  /** Busca livre por nome ou telefone (já aparada). Vazia = sem busca. */
  q: string;
  status: StatusCandidato | null;
  etapaId: string | null;
  /** 1-based. */
  page: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normalizes the /candidatos searchParams into typed, safe filters.
 *  Unknown status/etapa values and invalid pages fall back to defaults. */
export function parseFiltros(sp: Record<string, string | string[] | undefined>): FiltrosCandidatos {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const q = (one(sp.q) ?? "").trim().slice(0, 80);

  const statusRaw = one(sp.status);
  const status = STATUS_VALIDOS.includes(statusRaw as StatusCandidato)
    ? (statusRaw as StatusCandidato)
    : null;

  const etapaRaw = one(sp.etapa);
  const etapaId = etapaRaw && UUID_RE.test(etapaRaw) ? etapaRaw : null;

  const pageRaw = Number.parseInt(one(sp.p) ?? "1", 10);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? pageRaw : 1;

  return { q, status, etapaId, page };
}

/** Builds the PostgREST `or()` filter matching `q` against nome (ilike) and
 *  telefone (digits). Returns null when the query has nothing usable.
 *  Commas/parens are stripped (they would break or() parsing) and ilike
 *  wildcards are escaped so user input is matched literally. */
export function buscaOr(q: string): string | null {
  const texto = q
    .replace(/[,()]/g, " ")
    .replace(/([\\%_])/g, "\\$1")
    .replace(/\s+/g, " ")
    .trim();
  const digitos = q.replace(/\D/g, "");

  const partes: string[] = [];
  if (texto.length > 0) partes.push(`nome.ilike.*${texto}*`);
  if (digitos.length >= 4) partes.push(`telefone.ilike.*${digitos}*`);
  if (partes.length === 0) return null;
  return partes.join(",");
}
