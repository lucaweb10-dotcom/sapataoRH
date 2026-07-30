import { scoreFaixa, type ScoreFaixa } from "@/lib/funil/scoring";

const FAIXA_STYLE: Record<ScoreFaixa, string> = {
  sem: "bg-muted text-muted-foreground",
  baixo: "bg-danger-soft text-danger-foreground",
  medio: "bg-warning-soft text-warning-foreground",
  alto: "bg-success-soft text-success-foreground",
};

/** Pill with the IA score colored by faixa; "—" when not analyzed yet. */
export function ScoreBadge({ score }: { score: number | null }) {
  const faixa = scoreFaixa(score);
  return (
    <span
      className={`shrink-0 rounded-full px-2 py-0.5 text-micro font-bold tabular ${FAIXA_STYLE[faixa]}`}
      title="Score IA"
    >
      {faixa === "sem" ? "—" : score}
    </span>
  );
}
