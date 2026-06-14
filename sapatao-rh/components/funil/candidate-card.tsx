"use client";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { scoreFaixa, type ScoreFaixa } from "@/lib/funil/scoring";
import { tempoNaEtapa } from "@/lib/funil/tempo";
import type { CandidatoFunil } from "@/lib/funil/queries";

const FAIXA_STYLE: Record<ScoreFaixa, string> = {
  sem: "bg-neutro-100 text-neutro-600",
  baixo: "bg-[#fbe6df] text-[#c0492b]",
  medio: "bg-[#f8ecd9] text-[#a9692a]",
  alto: "bg-brand-50 text-brand-700",
};

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function CandidateCard({
  candidato,
  cor,
  now,
  canMove,
  onOpen,
}: {
  candidato: CandidatoFunil;
  /** Color of the stage this card sits in — paints the left edge. */
  cor: string;
  now: number;
  canMove: boolean;
  onOpen: (c: CandidatoFunil) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: candidato.id,
    data: { candidato },
    disabled: !canMove,
  });
  const faixa = scoreFaixa(candidato.score_ia);
  const tempo = tempoNaEtapa(candidato.etapa_entrou_em, now);
  const tags = (candidato.tags ?? []).slice(0, 3);

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        borderLeftColor: cor,
      }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(candidato)}
      className={`cursor-pointer rounded-xl border border-l-[3px] border-neutro-200 bg-card p-3 shadow-warm transition-all hover:-translate-y-0.5 hover:shadow-warm-md ${
        canMove ? "active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start gap-2.5">
        <Avatar className="shrink-0">
          {candidato.avatar_url && <AvatarImage src={candidato.avatar_url} alt={candidato.nome} />}
          <AvatarFallback className="bg-brand-700 font-semibold text-neutro-50">
            {initials(candidato.nome)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutro-900">{candidato.nome}</p>
          {candidato.vaga_interesse && (
            <p className="truncate text-xs text-neutro-500">{candidato.vaga_interesse}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${FAIXA_STYLE[faixa]}`}
          title="Score IA"
        >
          {faixa === "sem" ? "—" : candidato.score_ia}
        </span>
      </div>

      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="truncate rounded-full border border-neutro-200 bg-neutro-50 px-2 py-0.5 text-[10px] font-medium text-neutro-600"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {tempo && (
        <div className="mt-2.5 flex items-center gap-1 text-[10px] text-neutro-500">
          <Clock className="size-3 shrink-0" />
          {tempo === "agora" ? "agora" : `${tempo} na etapa`}
        </div>
      )}
    </div>
  );
}
