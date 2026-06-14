export type ScoreFaixa = "sem" | "baixo" | "medio" | "alto";

/** Buckets an IA score (0–100) into a faixa for card badge coloring. */
export function scoreFaixa(score: number | null | undefined): ScoreFaixa {
  if (score === null || score === undefined) return "sem";
  if (score < 40) return "baixo";
  if (score < 70) return "medio";
  return "alto";
}
