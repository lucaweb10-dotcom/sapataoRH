import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
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
      <PageHeader
        title="Indicadores"
        description="Visão geral do recrutamento e seleção."
      />

      <div className="space-y-8">
        <Suspense>
          <ResumoCards resumo={resumo} periodo={periodo} />
        </Suspense>

        <Section title="Snapshot do funil">
          <FunilSnapshot etapas={etapas} />
        </Section>

        <EntradasChart dados={entradas} />
      </div>
    </PageContainer>
  );
}
