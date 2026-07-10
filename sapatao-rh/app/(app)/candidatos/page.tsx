import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { FiltrosBar } from "@/components/candidatos/filtros-bar";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";
import { CandidatosTabela, type EtapaInfo } from "@/components/candidatos/tabela";
import { PaginacaoNav } from "@/components/shared/paginacao-nav";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas } from "@/lib/funil/queries";
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
  const [funil, lista, vagas, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listCandidatos(filtros),
    listVagasDistintas(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];
  const canCreate = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  const etapas = funil?.etapas ?? [];
  const etapasById: Record<string, EtapaInfo> = {};
  for (const e of etapas) etapasById[e.id] = { nome: e.nome, cor: e.cor };

  const { rows, total } = lista;
  const temFiltro = filtros.q !== "" || filtros.status !== null || filtros.etapaId !== null;

  return (
    <PageContainer>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Candidatos</h1>
          <p className="text-sm text-neutro-700">
            Base completa de quem já se candidatou — inclui contratados, reprovados e desistentes.
          </p>
        </div>
        {canCreate && <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="ficha" />}
      </div>

      <div className="mt-6 space-y-4">
        <FiltrosBar etapas={etapas} />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutro-200 bg-card px-6 py-14 text-center">
            <Users className="size-8 text-neutro-400" />
            {temFiltro ? (
              <>
                <p className="text-sm text-neutro-700">
                  Nenhum candidato encontrado com esses filtros.
                </p>
                <Button size="sm" variant="outline" render={<Link href="/candidatos" />}>
                  Limpar filtros
                </Button>
              </>
            ) : (
              <p className="max-w-sm text-sm text-neutro-700">
                Nenhum candidato ainda. Eles entram aqui automaticamente quando mandam mensagem no
                WhatsApp da empresa.
              </p>
            )}
          </div>
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
