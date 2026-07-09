import { scoreFaixa, type ScoreFaixa } from "@/lib/funil/scoring";

const FAIXA_STYLE: Record<ScoreFaixa, string> = {
  sem: "bg-neutro-100 text-neutro-600",
  baixo: "bg-[#fbe6df] text-[#c0492b]",
  medio: "bg-[#f8ecd9] text-[#a9692a]",
  alto: "bg-brand-50 text-brand-700",
};

/** Pill with the IA score colored by faixa; "—" when not analyzed yet. */
export function ScoreBadge({ score }: { score: number | null }) {
  const faixa = scoreFaixa(score);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${FAIXA_STYLE[faixa]}`}
      title="Score IA"
    >
      {faixa === "sem" ? "—" : score}
    </span>
  );
}
