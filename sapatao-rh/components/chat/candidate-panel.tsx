import Link from "next/link";
import type { Candidato } from "@/types/database";
import { ParecerView, type ParecerOrigem } from "@/components/cv/parecer-view";
import { AnalisarPerfilButton, type CargoOpcao } from "@/components/chat/analisar-perfil-button";

interface Props {
  candidato: Pick<
    Candidato,
    | "id"
    | "nome"
    | "telefone"
    | "vaga_interesse"
    | "etapa"
    | "tags"
    | "notas_internas"
    | "score_ia"
    | "parecer_ia"
    | "status"
  >;
  // SP3b (opcionais — outros usos do panel não quebram):
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
      <dt className="text-xs font-medium text-neutro-700">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutro-900">{value}</dd>
    </div>
  );
}

export function CandidatePanel({
  candidato,
  conversationId,
  viewerCanAnalisar,
  viewerIsAdmin,
  cargosIa,
  cargoSugeridoId,
  parecerOrigem,
}: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-neutro-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutro-200 p-4">
        <h3 className="font-display text-sm font-semibold text-neutro-900">Candidato</h3>
        <Link
          href={`/candidatos/${candidato.id}`}
          className="text-xs font-medium text-brand-700 hover:underline"
        >
          Ver ficha
        </Link>
      </div>

      <div className="flex-1 space-y-5 p-4">
        {/* Basic info */}
        <dl className="space-y-3">
          <InfoRow label="Nome" value={candidato.nome} />
          <InfoRow label="Telefone" value={candidato.telefone} />
          <InfoRow label="Vaga de interesse" value={candidato.vaga_interesse} />
          <InfoRow label="Etapa" value={candidato.etapa} />
          <InfoRow label="Status" value={candidato.status} />
        </dl>

        {/* Tags */}
        {candidato.tags && candidato.tags.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutro-700">Tags</p>
            <div className="flex flex-wrap gap-1.5">
              {candidato.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-neutro-200 bg-neutro-50 px-2 py-0.5 text-xs text-neutro-900"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Notas internas */}
        {candidato.notas_internas && (
          <div>
            <p className="mb-1 text-xs font-medium text-neutro-700">Notas internas</p>
            <p className="whitespace-pre-wrap text-sm text-neutro-900">{candidato.notas_internas}</p>
          </div>
        )}

        {/* Análise de IA */}
        <div className="rounded-lg border border-neutro-200 bg-neutro-50 p-3 space-y-3">
          <p className="text-xs font-medium text-neutro-700">Análise de IA</p>
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
          <ParecerView parecer={candidato.parecer_ia} score={candidato.score_ia} origem={parecerOrigem} />
        </div>
      </div>
    </div>
  );
}
