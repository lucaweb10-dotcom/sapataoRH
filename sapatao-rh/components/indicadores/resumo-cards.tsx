"use client";
import { useRouter, useSearchParams } from "next/navigation";
import { StatCard } from "@/components/ui/stat-card";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import type { ResumoIndicadores, PeriodoFiltro } from "@/lib/indicadores/queries";

const PERIODOS: { valor: PeriodoFiltro; label: string }[] = [
  { valor: "30d", label: "30 dias" },
  { valor: "90d", label: "90 dias" },
  { valor: "365d", label: "1 ano" },
  { valor: "all", label: "Tudo" },
];

export function ResumoCards({
  resumo,
  periodo,
}: {
  resumo: ResumoIndicadores;
  periodo: PeriodoFiltro;
}) {
  const router = useRouter();
  const params = useSearchParams();

  function mudarPeriodo(p: PeriodoFiltro) {
    const sp = new URLSearchParams(params.toString());
    sp.set("periodo", p);
    router.push(`/indicadores?${sp.toString()}`);
  }

  const periodoLabel = PERIODOS.find((p) => p.valor === periodo)?.label ?? "30 dias";

  return (
    <div className="space-y-5">
      <Tabs
        value={periodo}
        onValueChange={(v) => mudarPeriodo(v as PeriodoFiltro)}
      >
        <TabsList>
          {PERIODOS.map((p) => (
            <TabsTab key={p.valor} value={p.valor}>
              {p.label}
            </TabsTab>
          ))}
        </TabsList>
      </Tabs>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Ativos no funil" value={resumo.ativos} hint={periodoLabel} />
        <StatCard
          label="Contratados"
          value={resumo.contratados}
          hint={periodoLabel}
          tone="success"
        />
        <StatCard label="Reprovados" value={resumo.reprovados} hint={periodoLabel} />
        <StatCard
          label="Score IA médio"
          value={resumo.score_medio != null ? `${resumo.score_medio}` : "—"}
          hint={resumo.score_medio != null ? "de 100" : "sem análises"}
          tone="brand"
        />
      </div>
    </div>
  );
}
