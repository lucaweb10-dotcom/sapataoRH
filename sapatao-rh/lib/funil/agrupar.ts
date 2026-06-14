/**
 * Buckets candidatos by `etapa_id` into a Map keyed by stage id, in the given
 * stage order. Every stage gets an entry (empty array if none). Candidates with
 * a null or unknown etapa_id are dropped. Input order is preserved per stage.
 */
export function agruparPorEtapa<C extends { etapa_id: string | null }>(
  etapas: { id: string }[],
  candidatos: C[],
): Map<string, C[]> {
  const map = new Map<string, C[]>();
  for (const e of etapas) map.set(e.id, []);
  for (const c of candidatos) {
    if (c.etapa_id && map.has(c.etapa_id)) map.get(c.etapa_id)!.push(c);
  }
  return map;
}
