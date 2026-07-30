import { CalendarX2, Laptop, MapPin } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
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
    <Section title="Entrevistas nos próximos 7 dias">
      {entrevistas.length === 0 ? (
        <EmptyState
          icon={<CalendarX2 />}
          title="Nenhuma entrevista agendada"
          description="Agende pela ficha do candidato ou pelo card no funil."
          className="py-10"
        />
      ) : (
        <div className="space-y-2">
          {entrevistas.map((e) => (
            <div
              key={e.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700 [&_svg]:size-4">
                {e.formato === "online" ? <Laptop /> : <MapPin />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{e.candidato_nome}</p>
                <p className="text-caption text-muted-foreground">
                  {formatDataHora(e.data_hora)}
                  {e.local_ou_link && ` · ${e.local_ou_link}`}
                </p>
              </div>
              <Badge variant="outline" className="shrink-0 capitalize">
                {e.formato}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
