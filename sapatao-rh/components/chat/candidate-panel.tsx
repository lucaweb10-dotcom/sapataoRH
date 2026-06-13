import type { Candidato } from "@/types/database";

interface Props {
  candidato: Pick<
    Candidato,
    | "nome"
    | "telefone"
    | "vaga_interesse"
    | "etapa"
    | "tags"
    | "notas_internas"
    | "score_ia"
    | "status"
  >;
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

export function CandidatePanel({ candidato }: Props) {
  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-neutro-200 bg-white">
      {/* Header */}
      <div className="border-b border-neutro-200 p-4">
        <h3 className="font-display text-sm font-semibold text-neutro-900">Candidato</h3>
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

        {/* Score IA placeholder (SP3) */}
        <div className="rounded-lg border border-neutro-200 bg-neutro-50 p-3">
          <p className="text-xs font-medium text-neutro-700">Score IA</p>
          {candidato.score_ia !== null && candidato.score_ia !== undefined ? (
            <p className="mt-1 text-2xl font-bold text-sapatao-verde">{candidato.score_ia}</p>
          ) : (
            <p className="mt-1 text-sm text-neutro-700">Análise disponível no SP3</p>
          )}
        </div>
      </div>
    </div>
  );
}
