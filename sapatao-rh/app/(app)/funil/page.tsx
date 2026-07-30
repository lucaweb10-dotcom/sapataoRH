import { redirect } from "next/navigation";
import { Columns3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilDaUnidade, listCandidatosDoFunil } from "@/lib/funil/queries";
import { parseFunilFiltros } from "@/lib/funil/filtros";
import { listVagasDistintas } from "@/lib/candidatos/queries";
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/funil/board";
import { FunilFiltros } from "@/components/funil/funil-filtros";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";

export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const filtros = parseFunilFiltros(sp);

  const supabase = await createClient();
  // SP7: unidade selecionada com funil próprio → mostra ESSE funil; senão o Geral.
  const [funil, vagas, responsaveis, unidadesRes] = await Promise.all([
    getFunilDaUnidade(filtros.unidadeId ?? null),
    listVagasDistintas(),
    listarResponsaveis(),
    supabase
      .from("unidades")
      .select("id, nome")
      .eq("empresa_id", profile.empresa_id)
      .eq("ativa", true)
      .order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];

  if (!funil || funil.etapas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyState
          icon={<Columns3 />}
          title="Nenhum funil configurado"
          description="Crie as etapas em Configurações › Funil para começar a mover candidatos."
          className="w-full max-w-md"
        />
      </div>
    );
  }

  // Funil próprio da unidade JÁ é a visão da unidade (não filtra de novo por
  // unidade — um card migrado manualmente p/ lá nunca ficaria invisível).
  const funilDaUnidade = !!filtros.unidadeId && funil.funil.unidade_id === filtros.unidadeId;
  const unidadeSelecionada = filtros.unidadeId
    ? (unidades.find((u) => u.id === filtros.unidadeId) ?? null)
    : null;

  const etapaIds = funil.etapas.map((e) => e.id);
  const candidatos = await listCandidatosDoFunil(etapaIds, {
    q: filtros.q,
    vaga: filtros.vaga,
    respId: filtros.resp === "me" ? profile.id : filtros.resp,
    unidadeId: funilDaUnidade ? null : filtros.unidadeId,
  });
  const canMove = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-card px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="font-display text-section font-bold">Funil</h1>
          {unidadeSelecionada && (
            <Badge variant={funilDaUnidade ? "success" : "outline"}>
              {funilDaUnidade
                ? `Funil da unidade ${unidadeSelecionada.nome}`
                : `${unidadeSelecionada.nome} — usando o funil Geral`}
            </Badge>
          )}
          <FunilFiltros vagas={vagas} responsaveis={responsaveis} />
        </div>
        {canMove && <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="refresh" />}
      </div>
      <div className="min-h-0 flex-1">
        <Board
          etapas={funil.etapas}
          candidatos={candidatos}
          empresaId={profile.empresa_id}
          canMove={canMove}
        />
      </div>
    </div>
  );
}
