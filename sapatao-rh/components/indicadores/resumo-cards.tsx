"use client";
import { useRouter, useSearchParams } from "next/navigation";
import type { ResumoIndicadores, PeriodoFiltro } from "@/lib/indicadores/queries";

const PERIODOS: { valor: PeriodoFiltro; label: string }[] = [
  { valor: "30d", label: "30 dias" },
  { valor: "90d", label: "90 dias" },
  { valor: "365d", label: "1 ano" },
  { valor: "all", label: "Tudo" },
];

function Card({ titulo, valor, sub }: { titulo: string; valor: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutro-200 bg-white p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutro-700">{titulo}</p>
      <p className="mt-1 text-3xl font-bold text-neutro-900">{valor}</p>
      {sub && <p className="mt-0.5 text-xs text-neutro-700">{sub}</p>}
    </div>
  );
}

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
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-neutro-700">Período:</span>
        {PERIODOS.map((p) => (
          <button
            key={p.valor}
            type="button"
            onClick={() => mudarPeriodo(p.valor)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              p.valor === periodo
                ? "bg-brand-700 text-white"
                : "border border-neutro-200 bg-white text-neutro-700 hover:border-brand-700"
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card titulo="Ativos no funil" valor={resumo.ativos} sub={periodoLabel} />
        <Card titulo="Contratados" valor={resumo.contratados} sub={periodoLabel} />
        <Card titulo="Reprovados" valor={resumo.reprovados} sub={periodoLabel} />
        <Card
          titulo="Score IA médio"
          valor={resumo.score_medio != null ? `${resumo.score_medio}` : "—"}
          sub={resumo.score_medio != null ? "de 100" : "sem análises"}
        />
      </div>
    </div>
  );
}
