"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { AgendarDialog } from "./agendar-dialog";
import { ParecerView } from "@/components/cv/parecer-view";
import type { CandidatoFunil, HistoricoEntry } from "@/lib/funil/queries";
import type { FunilEtapa, Entrevista } from "@/types/database";
import { carregarHistorico, carregarEntrevista, moverCandidatoAction, salvarNotas } from "@/app/(app)/funil/actions";
import { iniciarConversa } from "@/app/(app)/candidatos/actions";

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
  const [entrevista, setEntrevista] = useState<Entrevista | null>(null);
  const [agendarOpen, setAgendarOpen] = useState(false);
  const [confirmEtapa, setConfirmEtapa] = useState<FunilEtapa | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!candidato) return;
    let alive = true;
    Promise.all([
      carregarHistorico(candidato.id),
      carregarEntrevista(candidato.id),
    ])
      .then(([h, e]) => {
        if (alive) {
          setHistorico(h);
          setEntrevista(e);
        }
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

  const onIniciarConversa = () => {
    startTransition(async () => {
      const r = await iniciarConversa(candidato.id);
      if (r.ok) router.push(`/chat?c=${r.conversationId}&tpl=saudacao`);
      else toast.error("Não foi possível iniciar a conversa.");
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

          {/* Análise de IA */}
          <div className="rounded-lg border border-neutro-200 bg-neutro-50 p-3">
            <p className="mb-2 text-xs font-medium text-neutro-700">Análise de IA</p>
            <ParecerView parecer={candidato.parecer_ia} score={candidato.score_ia} />
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

          {/* Entrevista agendada */}
          {entrevista && (
            <div className="rounded-lg border border-brand-200 bg-brand-50 p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-brand-700">Entrevista agendada</p>
              <p className="font-medium text-neutro-900">
                {new Date(entrevista.data_hora).toLocaleString("pt-BR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </p>
              <p className="text-neutro-700 capitalize">{entrevista.formato}</p>
              {entrevista.local_ou_link && (
                <p className="mt-0.5 truncate text-neutro-700">{entrevista.local_ou_link}</p>
              )}
              {entrevista.observacoes && (
                <p className="mt-1 text-neutro-700">{entrevista.observacoes}</p>
              )}
            </div>
          )}

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
          {candidato.conversationId ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/chat?c=${candidato.conversationId}`} />}
            >
              Abrir conversa
            </Button>
          ) : (
            canMove && (
              <Button size="sm" variant="outline" onClick={onIniciarConversa} disabled={pending}>
                Iniciar conversa
              </Button>
            )
          )}

          <Button size="sm" variant="outline" render={<Link href={`/candidatos/${candidato.id}`} />}>
            Ver ficha
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

          {canMove && (
            <Button size="sm" variant="outline" onClick={() => setAgendarOpen(true)} disabled={pending}>
              {entrevista ? "Reagendar" : "Agendar entrevista"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>

    <AgendarDialog
      open={agendarOpen}
      onOpenChange={setAgendarOpen}
      candidatoId={candidato.id}
      candidatoNome={candidato.nome}
      onSucesso={(e) => setEntrevista(e)}
    />

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
