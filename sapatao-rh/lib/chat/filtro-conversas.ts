// Filtro client-side dos chips da Central (Todas / Não lidas / Minhas). Puro.

export type FiltroConversas = "todas" | "nao-lidas" | "minhas";

export function parseFiltroConversas(raw: string | null | undefined): FiltroConversas {
  return raw === "nao-lidas" || raw === "minhas" ? raw : "todas";
}

type ConversaFiltravel = {
  unread_count: number;
  candidatos: { atribuido_a?: string | null } | null;
};

export function filtrarConversas<T extends ConversaFiltravel>(
  conversas: T[],
  filtro: FiltroConversas,
  userId: string | null,
): T[] {
  if (filtro === "nao-lidas") return conversas.filter((c) => (c.unread_count ?? 0) > 0);
  if (filtro === "minhas") {
    if (!userId) return [];
    return conversas.filter((c) => c.candidatos?.atribuido_a === userId);
  }
  return conversas;
}
