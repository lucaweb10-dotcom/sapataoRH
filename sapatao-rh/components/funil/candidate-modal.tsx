"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmMoveDialog } from "./confirm-move-dialog";
import type { CandidatoFunil, HistoricoEntry } from "@/lib/funil/queries";
import type { FunilEtapa } from "@/types/database";
import { carregarHistorico, moverCandidatoAction, salvarNotas } from "@/app/(app)/funil/actions";

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-medium text-neutro-700">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutro-900">{value}</dd>
    </div>
  );
}

export function CandidateModal({
  candidato,
  etapas,
  canMove,
  onClose,
}: {
  candidato: CandidatoFunil | null;
  etapas: FunilEtapa[];
  canMove: boolean;
  onClose: () => void;
}) {
  // The board remounts this modal per candidato (key=selectedId), so notas
  // initializes cleanly from props and historico loads once per mount.
  const [notas, setNotas] = useState(candidato?.notas_internas ?? "");
  const [historico, setHistorico] = useState<HistoricoEntry[]>([]);
  const [confirmEtapa, setConfirmEtapa] = useState<FunilEtapa | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!candidato) return;
    let alive = true;
    carregarHistorico(candidato.id)
      .then((h) => {
        if (alive) setHistorico(h);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [candidato]);

  if (!candidato) return null;

  const nomeEtapa = (id: string | null) => etapas.find((e) => e.id === id)?.nome ?? "—";
  const reprovado = etapas.find((e) => e.status_destino === "reprovado");

  const doMove = (paraEtapaId: string) => {
    startTransition(async () => {
      const r = await moverCandidatoAction({ candidatoId: candidato.id, paraEtapaId });
      if (r.ok) {
        toast.success("Candidato movido.");
        onClose();
      } else {
        toast.error("Não foi possível mover o candidato.");
      }
    });
  };

  // Same gate as the board: terminal/critical stages require explicit confirmation.
  const onMover = (paraEtapaId: string) => {
    if (paraEtapaId === candidato.etapa_id) return;
    const etapa = etapas.find((e) => e.id === paraEtapaId);
    if (etapa?.requires_confirm) {
      setConfirmEtapa(etapa);
      return;
    }
    doMove(paraEtapaId);
  };

  const onSalvarNotas = () => {
    startTransition(async () => {
      const r = await salvarNotas({ candidatoId: candidato.id, notas });
      if (r.ok) toast.success("Notas salvas.");
      else toast.error("Erro ao salvar notas.");
    });
  };

  return (
    <>
    <Dialog open={!!candidato} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{candidato.nome}</DialogTitle>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-5 overflow-y-auto pr-1">
          {/* Dados */}
          <dl className="grid grid-cols-2 gap-3">
            <Info label="Telefone" value={candidato.telefone} />
            <Info label="Vaga de interesse" value={candidato.vaga_interesse} />
            <Info label="CEP" value={candidato.cep} />
            <Info label="Idade" value={candidato.idade} />
            <Info label="Endereço" value={candidato.endereco} />
            <Info label="Etapa atual" value={nomeEtapa(candidato.etapa_id)} />
          </dl>

          {/* Tags */}
          {candidato.tags && candidato.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {candidato.tags.map((t) => (
                <span
                  key={t}
                  className="rounded-full border border-neutro-200 bg-neutro-50 px-2 py-0.5 text-xs text-neutro-700"
                >
                  {t}
                </span>
              ))}
            </div>
          )}

          {/* Score IA (SP3) */}
          <div className="rounded-lg border border-neutro-200 bg-neutro-50 p-3">
            <p className="text-xs font-medium text-neutro-700">Score IA</p>
            {candidato.score_ia !== null && candidato.score_ia !== undefined ? (
              <p className="mt-1 text-2xl font-bold text-sapatao-verde">{candidato.score_ia}</p>
            ) : (
              <p className="mt-1 text-sm text-neutro-700">Análise disponível no SP3</p>
            )}
          </div>

          {/* Notas internas */}
          <div>
            <label className="mb-1 block text-xs font-medium text-neutro-700">Notas internas</label>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              disabled={!canMove || pending}
              rows={3}
              className="w-full rounded-lg border border-neutro-200 p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
              placeholder="Anotações da equipe…"
            />
            {canMove && (
              <div className="mt-1.5 flex justify-end">
                <Button size="sm" variant="outline" onClick={onSalvarNotas} disabled={pending}>
                  Salvar notas
                </Button>
              </div>
            )}
          </div>

          {/* Histórico */}
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutro-700">Histórico de etapas</p>
            {historico.length === 0 ? (
              <p className="text-sm text-neutro-700">Sem movimentações registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {historico.map((h) => (
                  <li key={h.id} className="text-xs text-neutro-700">
                    <span className="text-neutro-900">{nomeEtapa(h.de_etapa)}</span> →{" "}
                    <span className="text-neutro-900">{nomeEtapa(h.para_etapa)}</span>
                    {h.movido_por_nome && <> · {h.movido_por_nome}</>}
                    <span className="text-neutro-700">
                      {" "}
                      · {new Date(h.created_at).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Ações */}
        <div className="flex flex-wrap items-center gap-2 border-t border-neutro-200 pt-3">
          <Button
            size="sm"
            variant="outline"
            render={
              candidato.conversationId ? (
                <Link href={`/chat?c=${candidato.conversationId}`} />
              ) : undefined
            }
            disabled={!candidato.conversationId}
          >
            Abrir conversa
          </Button>

          {canMove && (
            <Select value={null} onValueChange={(v: string | null) => { if (v) onMover(v); }}>
              <SelectTrigger size="sm">
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

          {canMove && reprovado && candidato.etapa_id !== reprovado.id && (
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

          <Button size="sm" variant="ghost" disabled title="Disponível no SP5">
            Agendar entrevista
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {confirmEtapa && (
      <ConfirmMoveDialog
        open={!!confirmEtapa}
        onOpenChange={(o) => {
          if (!o) setConfirmEtapa(null);
        }}
        nome={candidato.nome}
        etapaNome={confirmEtapa.nome}
        onConfirm={() => {
          doMove(confirmEtapa.id);
          setConfirmEtapa(null);
        }}
      />
    )}
    </>
  );
}
