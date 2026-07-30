import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FiltrosBar } from "@/components/candidatos/filtros-bar";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";
import { CandidatosTabela, type EtapaInfo } from "@/components/candidatos/tabela";
import { PaginacaoNav } from "@/components/shared/paginacao-nav";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listTodasEtapas } from "@/lib/funil/queries";
import { parseFiltros } from "@/lib/candidatos/filtros";
import { listCandidatos, listVagasDistintas } from "@/lib/candidatos/queries";
import { totalPaginas, resumoPaginacao } from "@/lib/shared/paginacao";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CandidatosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const filtros = parseFiltros(sp);

  const supabase = await createClient();
  const [funil, todasEtapas, lista, vagas, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listTodasEtapas(),
    listCandidatos(filtros),
    listVagasDistintas(),
    supabase
      .from("unidades")
      .select("id, nome")
      .eq("empresa_id", profile.empresa_id)
      .eq("ativa", true)
      .order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];
  const canCreate = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  // Filtro de etapa usa o funil Geral; os NOMES na tabela resolvem em qualquer
  // funil (SP7 — candidatos podem estar em funis de unidade).
  const etapas = funil?.etapas ?? [];
  const etapasById: Record<string, EtapaInfo> = {};
  for (const e of todasEtapas) etapasById[e.id] = { nome: e.nome, cor: e.cor };

  const { rows, total } = lista;
  const temFiltro = filtros.q !== "" || filtros.status !== null || filtros.etapaId !== null;

  return (
    <PageContainer>
      <PageHeader
        title="Candidatos"
        description="Base completa de quem já se candidatou — inclui contratados, reprovados e desistentes."
        actions={
          canCreate ? (
            <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="ficha" />
          ) : undefined
        }
      />

      <div className="space-y-4">
        <FiltrosBar etapas={etapas} />

        {rows.length === 0 ? (
          temFiltro ? (
            <EmptyState
              icon={<Users />}
              title="Nenhum candidato encontrado"
              description="Nenhum resultado para os filtros aplicados."
              action={
                <Button size="sm" variant="outline" render={<Link href="/candidatos" />}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<Users />}
              title="Nenhum candidato ainda"
              description="Eles entram aqui automaticamente quando mandam mensagem no WhatsApp da empresa."
            />
          )
        ) : (
          <>
            <CandidatosTabela rows={rows} etapasById={etapasById} />
            <PaginacaoNav
              page={filtros.page}
              totalPaginas={totalPaginas(total)}
              resumo={resumoPaginacao(filtros.page, total)}
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
