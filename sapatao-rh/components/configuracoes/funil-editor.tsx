"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@/components/ui/button";
import { EtapaFormDialog } from "./etapa-form-dialog";
import { aplicarReordenacao } from "@/lib/funil/reordenar";
import { reordenarEtapas, excluirEtapa } from "@/app/(app)/configuracoes/funil/actions";
import type { FunilEtapa } from "@/types/database";

function EtapaRow({
  etapa,
  funilId,
  count,
  onExcluir,
}: {
  etapa: FunilEtapa;
  funilId: string;
  count: number;
  onExcluir: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: etapa.id });
  const isIa = etapa.marcador === "ia_concluida";
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-3 rounded-lg border border-neutro-200 bg-white p-3"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab px-1 text-neutro-700 active:cursor-grabbing"
        aria-label="Arrastar para reordenar"
      >
        ⠿
      </button>
      <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: etapa.cor }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-neutro-900">{etapa.nome}</p>
        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-neutro-700">
          {etapa.is_terminal && (
            <span className="rounded bg-neutro-100 px-1.5 py-0.5">Terminal · {etapa.status_destino}</span>
          )}
          {etapa.requires_confirm && <span className="rounded bg-neutro-100 px-1.5 py-0.5">Confirma</span>}
          {etapa.sla_dias != null && <span className="rounded bg-neutro-100 px-1.5 py-0.5">SLA {etapa.sla_dias}d</span>}
          {isIa && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">usada pela IA</span>}
          <span className="rounded bg-neutro-100 px-1.5 py-0.5">
            {count} candidato{count === 1 ? "" : "s"}
          </span>
        </div>
      </div>
      <EtapaFormDialog funilId={funilId} etapa={etapa} />
      <Button
        size="sm"
        variant="ghost"
        className="text-destructive"
        disabled={count > 0}
        title={count > 0 ? "Mova os candidatos antes de excluir" : "Excluir etapa"}
        onClick={() => onExcluir(etapa.id)}
      >
        Excluir
      </Button>
    </div>
  );
}

export function FunilEditor({
  funilId,
  etapas: etapasProp,
  counts,
}: {
  funilId: string;
  etapas: FunilEtapa[];
  counts: Record<string, number>;
}) {
  const router = useRouter();
  const [etapas, setEtapas] = useState(etapasProp);
  // render-time sync ao mudar props (padrão do Kanban; evita lint set-state-in-effect)
  const [snap, setSnap] = useState(etapasProp);
  if (snap !== etapasProp) {
    setSnap(etapasProp);
    setEtapas(etapasProp);
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const ids = etapas.map((et) => et.id);
    const newIds = aplicarReordenacao(ids, String(active.id), ids.indexOf(String(over.id)));
    const prev = etapas;
    const byId = new Map(etapas.map((et) => [et.id, et]));
    setEtapas(newIds.map((id) => byId.get(id)!));
    reordenarEtapas(funilId, newIds)
      .then((r) => {
        if (!r.ok) {
          setEtapas(prev);
          toast.error("Não foi possível reordenar as etapas.");
        } else {
          router.refresh();
        }
      })
      .catch(() => {
        setEtapas(prev);
        toast.error("Erro de rede ao reordenar.");
      });
  };

  const onExcluir = (id: string) => {
    excluirEtapa(id)
      .then((r) => {
        if (r.ok) {
          toast.success("Etapa excluída.");
          router.refresh();
        } else {
          toast.error(
            r.error === "etapa_ocupada"
              ? "Esta etapa tem candidatos — mova-os antes de excluir."
              : r.error === "forbidden"
                ? "Sem permissão."
                : "Não foi possível excluir a etapa.",
          );
        }
      })
      .catch(() => toast.error("Erro ao excluir a etapa."));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <EtapaFormDialog funilId={funilId} />
      </div>
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <SortableContext items={etapas.map((e) => e.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {etapas.map((etapa) => (
              <EtapaRow
                key={etapa.id}
                etapa={etapa}
                funilId={funilId}
                count={counts[etapa.id] ?? 0}
                onExcluir={onExcluir}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
