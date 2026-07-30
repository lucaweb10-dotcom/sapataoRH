import Link from "next/link";
import { UserRoundSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Section } from "@/components/ui/section";
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
    <Section title="Candidatos recentes">
      {candidatos.length === 0 ? (
        <EmptyState
          icon={<UserRoundSearch />}
          title="Nenhum candidato novo"
          description="Novas conversas no WhatsApp entram aqui automaticamente."
          className="py-10"
        />
      ) : (
        <div className="space-y-2">
          {candidatos.map((c) => (
            <div
              key={c.id}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-xs"
            >
              <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold text-muted-foreground">
                {c.nome.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">{c.nome}</p>
                <p className="text-caption text-muted-foreground">
                  {c.telefone}
                  {c.vaga_interesse && ` · ${c.vaga_interesse}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="text-caption text-muted-foreground">{tempo(c.created_at)}</span>
                {c.conversation_id && (
                  <Button
                    variant="outline"
                    size="xs"
                    render={<Link href={`/chat?c=${c.conversation_id}`} />}
                  >
                    Chat
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}
