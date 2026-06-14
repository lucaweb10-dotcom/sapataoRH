export type PeriodoFiltro = "30d" | "90d" | "365d" | "all";

/** Retorna a data de corte para um período, ou null para "tudo". */
export function cutoffDoPeriodo(periodo: PeriodoFiltro, agora: Date): Date | null {
  if (periodo === "all") return null;
  const dias = periodo === "30d" ? 30 : periodo === "90d" ? 90 : 365;
  const d = new Date(agora);
  d.setDate(d.getDate() - dias);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Agrupa datas ISO em semanas (segunda-feira como início). Retorna as últimas nSemanas. */
export function agruparPorSemana(
  datas: string[],
  nSemanas: number,
  agora: Date,
): { rotulo: string; count: number }[] {
  const buckets: Map<string, number> = new Map();

  // Gera os últimos nSemanas buckets (segunda-feira de cada semana)
  for (let i = nSemanas - 1; i >= 0; i--) {
    const d = new Date(agora);
    d.setDate(d.getDate() - d.getDay() + 1 - i * 7); // segunda-feira
    d.setHours(0, 0, 0, 0);
    const chave = rotuloDeSemana(d);
    if (!buckets.has(chave)) buckets.set(chave, 0);
  }

  for (const iso of datas) {
    const d = new Date(iso);
    const seg = new Date(d);
    seg.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // segunda da semana
    seg.setHours(0, 0, 0, 0);
    const chave = rotuloDeSemana(seg);
    if (buckets.has(chave)) {
      buckets.set(chave, (buckets.get(chave) ?? 0) + 1);
    }
  }

  return Array.from(buckets.entries()).map(([rotulo, count]) => ({ rotulo, count }));
}

function rotuloDeSemana(segunda: Date): string {
  const d = String(segunda.getDate()).padStart(2, "0");
  const m = String(segunda.getMonth() + 1).padStart(2, "0");
  return `${d}/${m}`;
}

/** Retorna quantos candidatos estão dentro/fora do SLA de uma etapa. */
export function calcularSlaStatus(
  etapaEntroEmList: (string | null)[],
  slaDias: number | null,
  agora: Date,
): { dentro: number; fora: number } {
  if (slaDias == null) return { dentro: 0, fora: 0 };
  let dentro = 0;
  let fora = 0;
  const limiteMs = slaDias * 24 * 60 * 60 * 1000;
  for (const iso of etapaEntroEmList) {
    if (!iso) continue;
    const entrou = new Date(iso);
    if (agora.getTime() - entrou.getTime() <= limiteMs) {
      dentro++;
    } else {
      fora++;
    }
  }
  return { dentro, fora };
}

/** Calcula a média de um array numérico, ignorando nulls. Retorna null se vazio. */
export function media(valores: (number | null)[]): number | null {
  const validos = valores.filter((v): v is number => v !== null);
  if (validos.length === 0) return null;
  return Math.round(validos.reduce((s, v) => s + v, 0) / validos.length);
}
