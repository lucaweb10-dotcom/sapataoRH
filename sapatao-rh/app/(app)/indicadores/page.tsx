import { PageContainer } from "@/components/shell/page-container";
import { ResumoCards } from "@/components/indicadores/resumo-cards";
import { FunilSnapshot } from "@/components/indicadores/funil-snapshot";
import { EntradasChart } from "@/components/indicadores/entradas-chart";
import {
  getResumoIndicadores,
  getSnapshotFunil,
  getEntradasSemanais,
  type PeriodoFiltro,
} from "@/lib/indicadores/queries";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

const PERIODOS_VALIDOS: PeriodoFiltro[] = ["30d", "90d", "365d", "all"];

function isPeriodo(v: unknown): v is PeriodoFiltro {
  return PERIODOS_VALIDOS.includes(v as PeriodoFiltro);
}

export default async function IndicadoresPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const periodo: PeriodoFiltro = isPeriodo(sp.periodo) ? sp.periodo : "30d";

  const [resumo, etapas, entradas] = await Promise.all([
    getResumoIndicadores(periodo),
    getSnapshotFunil(),
    getEntradasSemanais(8),
  ]);

  return (
    <PageContainer>
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Indicadores</h1>
        <p className="text-sm text-neutro-700">Visão geral do recrutamento e seleção.</p>
      </div>

      <div className="mt-6 space-y-6">
        <Suspense>
          <ResumoCards resumo={resumo} periodo={periodo} />
        </Suspense>

        <div>
          <h2 className="mb-3 text-sm font-semibold text-neutro-900">Snapshot do funil</h2>
          <FunilSnapshot etapas={etapas} />
        </div>

        <EntradasChart dados={entradas} />
      </div>
    </PageContainer>
  );
}
