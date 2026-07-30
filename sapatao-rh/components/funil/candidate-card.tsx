"use client";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScoreBadge } from "@/components/shared/score-badge";
import { tempoNaEtapa } from "@/lib/funil/tempo";
import type { CandidatoFunil } from "@/lib/funil/queries";

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
      className={`cursor-pointer rounded-xl border border-l-[3px] border-border bg-card p-3.5 shadow-xs transition-all duration-200 ease-soft hover:-translate-y-0.5 hover:border-border-strong hover:shadow-sm ${
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
          <p className="truncate text-sm font-semibold text-foreground">{candidato.nome}</p>
          {candidato.vaga_interesse && (
            <p className="truncate text-caption text-muted-foreground">
              {candidato.vaga_interesse}
            </p>
          )}
        </div>
        <ScoreBadge score={candidato.score_ia} />
      </div>

      {tags.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {tags.map((t) => (
            <span
              key={t}
              className="truncate rounded-full border border-border bg-muted px-2 py-0.5 text-micro font-medium text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {tempo && (
        <div className="mt-2.5 flex items-center gap-1 text-micro text-muted-foreground">
          <Clock className="size-3 shrink-0" />
          {tempo === "agora" ? "agora" : `${tempo} na etapa`}
        </div>
      )}
    </div>
  );
}
