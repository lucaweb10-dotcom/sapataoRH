import Link from "next/link";
import type { CandidatoRecente } from "@/lib/dashboard/queries";

function tempo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 60) return `${min}min atrás`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h atrás`;
  return `${Math.floor(h / 24)}d atrás`;
}

export function CandidatosRecentes({ candidatos }: { candidatos: CandidatoRecente[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutro-900">Candidatos recentes</h2>
      {candidatos.length === 0 ? (
        <p className="text-sm text-neutro-700">Nenhum candidato novo recentemente.</p>
      ) : (
        <div className="space-y-2">
          {candidatos.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-lg border border-neutro-200 bg-white p-3"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-neutro-100 text-sm font-bold text-neutro-700">
                {c.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutro-900">{c.nome}</p>
                <p className="text-xs text-neutro-700">
                  {c.telefone}
                  {c.vaga_interesse && ` · ${c.vaga_interesse}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-xs text-neutro-700">{tempo(c.created_at)}</span>
                {c.conversation_id && (
                  <Link
                    href={`/chat?c=${c.conversation_id}`}
                    className="rounded border border-neutro-200 px-2 py-0.5 text-xs text-neutro-700 hover:border-brand-700 hover:text-brand-700"
                  >
                    Chat
                  </Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
