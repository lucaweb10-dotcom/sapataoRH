"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AgendarDialog } from "@/components/funil/agendar-dialog";
import { ConfirmMoveDialog } from "@/components/funil/confirm-move-dialog";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import type { FunilEtapa } from "@/types/database";

/** Action row of the ficha: abrir conversa, mover etapa (with confirmation on
 *  critical stages), reprovar and agendar entrevista. Mirrors the funil modal
 *  rules; refreshes the server-rendered page after each mutation. */
export function FichaAcoes({
  candidatoId,
  nome,
  etapaId,
  conversationId,
  etapas,
  canEdit,
  temEntrevista,
}: {
  candidatoId: string;
  nome: string;
  etapaId: string | null;
  conversationId: string | null;
  etapas: FunilEtapa[];
  canEdit: boolean;
  temEntrevista: boolean;
}) {
  const router = useRouter();
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [confirmEtapa, setConfirmEtapa] = useState<FunilEtapa | null>(null);
  const [pending, startTransition] = useTransition();

  const reprovado = etapas.find((e) => e.status_destino === "reprovado");

  const doMove = (paraEtapaId: string) => {
    startTransition(async () => {
      const r = await moverCandidatoAction({ candidatoId, paraEtapaId });
      if (r.ok) {
        toast.success("Candidato movido.");
        router.refresh();
      } else {
        toast.error("Não foi possível mover o candidato.");
      }
    });
  };

  const onMover = (paraEtapaId: string) => {
    if (paraEtapaId === etapaId) return;
    const etapa = etapas.find((e) => e.id === paraEtapaId);
    if (etapa?.requires_confirm) {
      setConfirmEtapa(etapa);
      return;
    }
    doMove(paraEtapaId);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        render={conversationId ? <Link href={`/chat?c=${conversationId}`} /> : undefined}
        disabled={!conversationId}
      >
        <MessagesSquare className="size-3.5" />
        Abrir conversa
      </Button>

      {canEdit && (
        <Select value={null} onValueChange={(v: string | null) => { if (v) onMover(v); }}>
          <SelectTrigger size="sm" disabled={pending}>
            <SelectValue placeholder="Mover etapa" />
          </SelectTrigger>
          <SelectContent>
            {etapas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {canEdit && (
        <Button size="sm" variant="outline" onClick={() => setAgendarOpen(true)} disabled={pending}>
          {temEntrevista ? "Reagendar entrevista" : "Agendar entrevista"}
        </Button>
      )}

      {canEdit && reprovado && etapaId !== reprovado.id && (
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => onMover(reprovado.id)}
          disabled={pending}
        >
          Reprovar
        </Button>
      )}

      <AgendarDialog
        open={agendarOpen}
        onOpenChange={setAgendarOpen}
        candidatoId={candidatoId}
        candidatoNome={nome}
        onSucesso={() => router.refresh()}
      />

      {confirmEtapa && (
        <ConfirmMoveDialog
          open={!!confirmEtapa}
          onOpenChange={(o) => {
            if (!o) setConfirmEtapa(null);
          }}
          nome={nome}
          etapaNome={confirmEtapa.nome}
          onConfirm={() => {
            doMove(confirmEtapa.id);
            setConfirmEtapa(null);
          }}
        />
      )}
    </div>
  );
}
