"use client";
import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { toast } from "sonner";
import { agruparPorEtapa } from "@/lib/funil/agrupar";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import { CandidateCard } from "./candidate-card";
import { CandidateModal } from "./candidate-modal";
import { ConfirmMoveDialog } from "./confirm-move-dialog";
import { FunilRealtime } from "./realtime";
import type { CandidatoFunil } from "@/lib/funil/queries";
import type { FunilEtapa } from "@/types/database";

function Column({
  etapa,
  count,
  children,
}: {
  etapa: FunilEtapa;
  count: number;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  return (
    <div className="flex w-72 shrink-0 flex-col rounded-xl border border-neutro-200 bg-neutro-50">
      <div className="flex items-center gap-2 border-b border-neutro-200 px-3 py-2">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: etapa.cor }} />
        <span className="truncate text-sm font-semibold text-neutro-900">{etapa.nome}</span>
        <span className="ml-auto shrink-0 rounded-full bg-neutro-200 px-1.5 text-xs text-neutro-700">
          {count}
        </span>
      </div>
      <div
        ref={setNodeRef}
        className={`flex-1 space-y-2 overflow-y-auto p-2 transition-colors ${
          isOver ? "bg-neutro-200/60" : ""
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function Board({
  etapas,
  candidatos,
  empresaId,
  canMove,
}: {
  etapas: FunilEtapa[];
  candidatos: CandidatoFunil[];
  empresaId: string;
  canMove: boolean;
}) {
  // Local copy for optimistic moves; re-synced when the server data changes
  // (realtime / router.refresh feeds new props). Uses React's render-time
  // "adjust state on prop change" pattern instead of an effect.
  const [cards, setCards] = useState(candidatos);
  const [serverSnapshot, setServerSnapshot] = useState(candidatos);
  if (serverSnapshot !== candidatos) {
    setServerSnapshot(candidatos);
    setCards(candidatos);
  }

  // Shared 60s tick so "tempo na etapa" labels stay fresh without per-card timers.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const [selected, setSelected] = useState<CandidatoFunil | null>(null);
  const [pendingMove, setPendingMove] = useState<{ candidato: CandidatoFunil; etapa: FunilEtapa } | null>(
    null,
  );

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const grouped = useMemo(() => agruparPorEtapa(etapas, cards), [etapas, cards]);

  const performMove = (candidato: CandidatoFunil, etapa: FunilEtapa) => {
    const prev = cards;
    setCards((cs) =>
      cs.map((c) =>
        c.id === candidato.id
          ? { ...c, etapa_id: etapa.id, etapa_entrou_em: new Date().toISOString() }
          : c,
      ),
    );
    moverCandidatoAction({ candidatoId: candidato.id, paraEtapaId: etapa.id })
      .then((r) => {
        if (!r.ok) {
          setCards(prev);
          toast.error("Não foi possível mover o candidato.");
        }
      })
      .catch(() => {
        setCards(prev);
        toast.error("Erro de rede ao mover.");
      });
  };

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over) return;
    const candidato = cards.find((c) => c.id === String(active.id));
    const etapa = etapas.find((et) => et.id === String(over.id));
    if (!candidato || !etapa || candidato.etapa_id === etapa.id) return;
    if (etapa.requires_confirm) {
      setPendingMove({ candidato, etapa });
      return;
    }
    performMove(candidato, etapa);
  };

  const columns = etapas.map((etapa) => {
    const list = grouped.get(etapa.id) ?? [];
    return (
      <Column key={etapa.id} etapa={etapa} count={list.length}>
        {list.map((c) => (
          <CandidateCard key={c.id} candidato={c} now={now} canMove={canMove} onOpen={setSelected} />
        ))}
        {list.length === 0 && (
          <p className="px-1 py-6 text-center text-xs text-neutro-700">Vazio</p>
        )}
      </Column>
    );
  });

  return (
    <div className="flex h-full flex-col">
      <DndContext sensors={sensors} onDragEnd={canMove ? onDragEnd : undefined}>
        <div className="flex flex-1 gap-3 overflow-x-auto p-4">{columns}</div>
      </DndContext>

      <FunilRealtime empresaId={empresaId} />
      <CandidateModal
        key={selected?.id ?? "none"}
        candidato={selected}
        etapas={etapas}
        canMove={canMove}
        onClose={() => setSelected(null)}
      />
      {pendingMove && (
        <ConfirmMoveDialog
          open={!!pendingMove}
          onOpenChange={(o) => {
            if (!o) setPendingMove(null);
          }}
          nome={pendingMove.candidato.nome}
          etapaNome={pendingMove.etapa.nome}
          onConfirm={() => {
            performMove(pendingMove.candidato, pendingMove.etapa);
            setPendingMove(null);
          }}
        />
      )}
    </div>
  );
}
