"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmMoveDialog } from "@/components/funil/confirm-move-dialog";
import { EditarCandidatoDialog } from "@/components/candidatos/editar-candidato-dialog";
import { ParecerView, type ParecerOrigem } from "@/components/cv/parecer-view";
import { AnalisarPerfilButton, type CargoOpcao } from "@/components/chat/analisar-perfil-button";
import { CopilotoDialog } from "@/components/chat/copiloto-dialog";
import { UnidadeSelect, type UnidadeOpcao } from "@/components/candidatos/unidade-select";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import {
  atualizarCandidato,
  type Responsavel,
  type AtualizarPatch,
} from "@/app/(app)/candidatos/actions";
import type { Candidato, FunilEtapa } from "@/types/database";

const NINGUEM = "ninguem";

interface Props {
  candidato: Candidato;
  etapas: FunilEtapa[];
  vagas: string[];
  responsaveis: Responsavel[];
  canEdit: boolean;
  /** SP7: unidades ativas p/ o select de unidade (troca migra o card de funil). */
  unidades?: UnidadeOpcao[];
  // IA (SP3b) — opcionais: outros usos do panel não quebram.
  conversationId?: string;
  viewerCanAnalisar?: boolean;
  viewerIsAdmin?: boolean;
  cargosIa?: CargoOpcao[];
  cargoSugeridoId?: string | null;
  parecerOrigem?: ParecerOrigem | null;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-caption font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value}</dd>
    </div>
  );
}

/** Painel de AÇÃO do chat (SP6 spec §5) + análise de IA (SP3b): triagem completa
 *  sem sair da conversa — etapa (com confirmação nas críticas), tags, vaga,
 *  responsável, dados e o botão "Analisar perfil com IA". */
export function CandidatePanel({
  candidato,
  etapas,
  vagas,
  responsaveis,
  canEdit,
  unidades,
  conversationId,
  viewerCanAnalisar,
  viewerIsAdmin,
  cargosIa,
  cargoSugeridoId,
  parecerOrigem,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmEtapa, setConfirmEtapa] = useState<FunilEtapa | null>(null);

  // Estado local com render-time sync (padrão do Board): re-inicializa quando o
  // server manda um candidato novo (troca de conversa ou router.refresh).
  const [tags, setTags] = useState(candidato.tags);
  const [novaTag, setNovaTag] = useState("");
  const [vaga, setVaga] = useState(candidato.vaga_interesse ?? "");
  const [snapshot, setSnapshot] = useState(candidato);
  if (snapshot !== candidato) {
    setSnapshot(candidato);
    setTags(candidato.tags);
    setVaga(candidato.vaga_interesse ?? "");
    setNovaTag("");
  }

  const salvar = (patch: AtualizarPatch, okMsg: string) => {
    startTransition(async () => {
      const r = await atualizarCandidato(candidato.id, patch);
      if (r.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error("Não foi possível salvar.");
      }
    });
  };

  const addTag = () => {
    const t = novaTag.trim();
    setNovaTag("");
    if (!t || tags.includes(t)) return;
    const novas = [...tags, t];
    setTags(novas);
    salvar({ tags: novas }, "Tag adicionada.");
  };

  const removeTag = (t: string) => {
    const novas = tags.filter((x) => x !== t);
    setTags(novas);
    salvar({ tags: novas }, "Tag removida.");
  };

  const salvarVaga = () => {
    const v = vaga.trim();
    if (v === (candidato.vaga_interesse ?? "")) return;
    salvar({ vaga_interesse: v || null }, "Vaga atualizada.");
  };

  // Mesmo gate do modal do funil: etapas requires_confirm pedem confirmação.
  const doMove = (paraEtapaId: string) => {
    startTransition(async () => {
      const r = await moverCandidatoAction({ candidatoId: candidato.id, paraEtapaId });
      if (r.ok) {
        toast.success("Candidato movido.");
        router.refresh();
      } else {
        toast.error("Não foi possível mover o candidato.");
      }
    });
  };

  const onMover = (paraEtapaId: string | null) => {
    if (!paraEtapaId || paraEtapaId === candidato.etapa_id) return;
    const etapa = etapas.find((e) => e.id === paraEtapaId);
    if (etapa?.requires_confirm) {
      setConfirmEtapa(etapa);
      return;
    }
    doMove(paraEtapaId);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-border p-4">
        <h3 className="font-display text-sm font-semibold text-foreground">Candidato</h3>
        <div className="flex items-center gap-3">
          <Link
            href={candidato.unidade_id ? `/funil?u=${candidato.unidade_id}` : "/funil"}
            className="text-caption font-medium text-brand-700 hover:underline"
          >
            Ver no funil
          </Link>
          <Link
            href={`/candidatos/${candidato.id}`}
            className="text-caption font-medium text-brand-700 hover:underline"
          >
            Ver ficha
          </Link>
        </div>
      </div>

      <div className="flex-1 space-y-5 p-4">
        {/* Dados básicos */}
        <dl className="space-y-3">
          <InfoRow label="Nome" value={candidato.nome} />
          <InfoRow label="Telefone" value={candidato.telefone} />
          <InfoRow label="Status" value={candidato.status} />
        </dl>

        {/* Etapa do funil */}
        {etapas.length > 0 && (
          <div>
            <p className="mb-1.5 text-caption font-medium text-muted-foreground">Etapa do funil</p>
            {canEdit ? (
              <Select
                value={candidato.etapa_id}
                onValueChange={onMover}
                items={Object.fromEntries(etapas.map((e) => [e.id, e.nome]))}
              >
                <SelectTrigger size="sm" className="w-full" disabled={pending}>
                  <SelectValue placeholder="Sem etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-foreground">
                {etapas.find((e) => e.id === candidato.etapa_id)?.nome ?? "—"}
              </p>
            )}
          </div>
        )}

        {/* Vaga (autocomplete) */}
        <div>
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">Vaga de interesse</p>
          {canEdit ? (
            <>
              <input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                onBlur={salvarVaga}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                list="sp6-vagas-painel"
                disabled={pending}
                placeholder="ex.: Atendente"
                className="h-8 w-full rounded-md border border-border bg-muted px-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-sapatao-verde focus:outline-none disabled:opacity-50"
              />
              <datalist id="sp6-vagas-painel">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          ) : (
            <p className="text-sm text-foreground">{candidato.vaga_interesse ?? "—"}</p>
          )}
        </div>

        {/* Responsável */}
        <div>
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">Responsável</p>
          {canEdit ? (
            <Select
              value={candidato.atribuido_a ?? NINGUEM}
              onValueChange={(v: string | null) =>
                salvar(
                  { atribuido_a: v === NINGUEM || v === null ? null : v },
                  "Responsável atualizado.",
                )
              }
              items={{
                [NINGUEM]: "Ninguém",
                ...Object.fromEntries(responsaveis.map((r) => [r.id, r.nome])),
              }}
            >
              <SelectTrigger size="sm" className="w-full" disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-foreground">
              {responsaveis.find((r) => r.id === candidato.atribuido_a)?.nome ?? "Ninguém"}
            </p>
          )}
        </div>

        {/* Unidade (SP7 — trocar migra o card p/ o funil da unidade) */}
        {unidades && unidades.length > 0 && (
          <UnidadeSelect
            candidatoId={candidato.id}
            unidadeAtualId={candidato.unidade_id}
            unidades={unidades}
            canEdit={canEdit}
          />
        )}

        {/* Tags (chips editáveis) */}
        <div>
          <p className="mb-1.5 text-caption font-medium text-muted-foreground">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-caption text-foreground"
              >
                {tag}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remover tag ${tag}`}
                    onClick={() => removeTag(tag)}
                    disabled={pending}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {tags.length === 0 && !canEdit && (
              <span className="text-caption text-muted-foreground">Sem tags</span>
            )}
          </div>
          {canEdit && (
            <input
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              disabled={pending}
              placeholder="Nova tag + Enter"
              className="mt-1.5 h-7 w-full rounded-md border border-border bg-muted px-2.5 text-caption text-foreground placeholder:text-muted-foreground focus:border-sapatao-verde focus:outline-none disabled:opacity-50"
            />
          )}
        </div>

        {/* Editar dados */}
        {canEdit && (
          <EditarCandidatoDialog
            candidato={candidato}
            temConversa
            vagas={vagas}
            responsaveis={responsaveis}
          />
        )}

        {/* Notas internas */}
        {candidato.notas_internas && (
          <div>
            <p className="mb-1 text-caption font-medium text-muted-foreground">Notas internas</p>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {candidato.notas_internas}
            </p>
          </div>
        )}

        {/* Análise de IA (SP3b) */}
        <div className="rounded-lg border border-border bg-muted p-3 space-y-3">
          <p className="text-caption font-medium text-muted-foreground">Análise de IA</p>
          {conversationId && (
            <AnalisarPerfilButton
              conversationId={conversationId}
              jaTemParecer={!!candidato.parecer_ia}
              canAnalisar={!!viewerCanAnalisar}
              isAdmin={!!viewerIsAdmin}
              cargos={cargosIa ?? []}
              cargoSugeridoId={cargoSugeridoId ?? null}
            />
          )}
          <CopilotoDialog
            candidatoId={candidato.id}
            candidatoNome={candidato.nome}
            canUsar={!!viewerCanAnalisar}
            isAdmin={!!viewerIsAdmin}
          />
          <ParecerView
            parecer={candidato.parecer_ia}
            score={candidato.score_ia}
            origem={parecerOrigem}
          />
        </div>
      </div>

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
    </div>
  );
}
