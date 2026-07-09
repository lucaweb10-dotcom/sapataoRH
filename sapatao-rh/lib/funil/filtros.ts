export type FiltrosFunil = {
  /** Busca livre por nome/telefone (já aparada). Vazia = sem busca. */
  q: string;
  vaga: string | null;
  /** uuid de profile, "me" (resolvido para o usuário logado no server) ou null. */
  resp: string | null;
  unidadeId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza os searchParams do /funil (?q=&vaga=&resp=&u=) em filtros tipados. */
export function parseFunilFiltros(
  sp: Record<string, string | string[] | undefined>,
): FiltrosFunil {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const vagaRaw = (one(sp.vaga) ?? "").trim().slice(0, 80);
  const respRaw = one(sp.resp);
  const uRaw = one(sp.u);

  let resp: string | null = null;
  if (respRaw === "me") resp = "me";
  else if (respRaw && UUID_RE.test(respRaw)) resp = respRaw;

  return {
    q,
    vaga: vagaRaw || null,
    resp,
    unidadeId: uRaw && UUID_RE.test(uRaw) ? uRaw : null,
  };
}
