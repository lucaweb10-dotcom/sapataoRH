"use client";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
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
  now,
  canMove,
  onOpen,
}: {
  candidato: CandidatoFunil;
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
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(candidato)}
      className={`cursor-pointer rounded-lg border border-neutro-200 bg-white p-2.5 shadow-sm transition-shadow hover:shadow ${
        canMove ? "active:cursor-grabbing" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <Avatar size="sm" className="shrink-0">
          {candidato.avatar_url && <AvatarImage src={candidato.avatar_url} alt={candidato.nome} />}
          <AvatarFallback>{initials(candidato.nome)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-neutro-900">{candidato.nome}</p>
          {candidato.vaga_interesse && (
            <p className="truncate text-xs text-neutro-700">{candidato.vaga_interesse}</p>
          )}
        </div>
        <span
          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${FAIXA_STYLE[faixa]}`}
          title="Score IA"
        >
          {faixa === "sem" ? "—" : candidato.score_ia}
        </span>
      </div>
      {(tags.length > 0 || tempo) && (
        <div className="mt-2 flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap gap-1">
            {tags.map((t) => (
              <span
                key={t}
                className="truncate rounded-full border border-neutro-200 bg-neutro-50 px-1.5 py-0.5 text-[10px] text-neutro-700"
              >
                {t}
              </span>
            ))}
          </div>
          {tempo && <span className="shrink-0 text-[10px] text-neutro-700">{tempo}</span>}
        </div>
      )}
    </div>
  );
}
