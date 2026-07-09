export const PAGE_SIZE = 30;

/** Inclusive row range for a 1-based page, for supabase `.range(from, to)`. */
export function rangeDaPagina(page: number, pageSize = PAGE_SIZE): { from: number; to: number } {
  const p = Math.max(1, Math.floor(page));
  const from = (p - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function totalPaginas(total: number, pageSize = PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / pageSize));
}

/** "1–25 de 132" summary for the table footer; empty result -> "0 de 0". */
export function resumoPaginacao(page: number, total: number, pageSize = PAGE_SIZE): string {
  if (total <= 0) return "0 de 0";
  const { from } = rangeDaPagina(page, pageSize);
  const inicio = Math.min(from + 1, total);
  const fim = Math.min(from + pageSize, total);
  return `${inicio}–${fim} de ${total}`;
}
