/**
 * Reordena `ids` movendo `fromId` para `toIndex` (clamp em [0, len-1]).
 * Retorna uma nova lista; se `fromId` não existe, retorna a lista inalterada (cópia).
 */
export function aplicarReordenacao(ids: string[], fromId: string, toIndex: number): string[] {
  if (ids.indexOf(fromId) === -1) return ids.slice();
  const rest = ids.filter((id) => id !== fromId);
  const clamped = Math.max(0, Math.min(toIndex, rest.length));
  rest.splice(clamped, 0, fromId);
  return rest;
}
