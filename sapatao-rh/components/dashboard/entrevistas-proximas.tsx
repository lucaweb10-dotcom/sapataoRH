import type { EntrevistaProxima } from "@/lib/dashboard/queries";

function formatDataHora(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const amanha = new Date(hoje);
  amanha.setDate(hoje.getDate() + 1);

  const isHoje = d.toDateString() === hoje.toDateString();
  const isAmanha = d.toDateString() === amanha.toDateString();

  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  if (isHoje) return `Hoje às ${hora}`;
  if (isAmanha) return `Amanhã às ${hora}`;
  return d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" }) + ` · ${hora}`;
}

export function EntrevistaProximas({ entrevistas }: { entrevistas: EntrevistaProxima[] }) {
  return (
    <div>
      <h2 className="mb-3 text-sm font-semibold text-neutro-900">Entrevistas nos próximos 7 dias</h2>
      {entrevistas.length === 0 ? (
        <p className="text-sm text-neutro-700">Nenhuma entrevista agendada.</p>
      ) : (
        <div className="space-y-2">
          {entrevistas.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-lg border border-neutro-200 bg-white p-3"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-lg">
                {e.formato === "online" ? "💻" : "📍"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutro-900">{e.candidato_nome}</p>
                <p className="text-xs text-neutro-700">
                  {formatDataHora(e.data_hora)}
                  {e.local_ou_link && ` · ${e.local_ou_link}`}
                </p>
              </div>
              <span className="shrink-0 rounded-full border border-neutro-200 px-2 py-0.5 text-xs text-neutro-700 capitalize">
                {e.formato}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
