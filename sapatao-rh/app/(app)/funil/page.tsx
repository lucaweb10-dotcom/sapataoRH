import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listCandidatosDoFunil } from "@/lib/funil/queries";
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
  const [funil, vagas, responsaveis, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];

  if (!funil || funil.etapas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutro-700">
        Nenhum funil configurado para esta empresa.
      </div>
    );
  }

  const etapaIds = funil.etapas.map((e) => e.id);
  const candidatos = await listCandidatosDoFunil(etapaIds, {
    q: filtros.q,
    vaga: filtros.vaga,
    respId: filtros.resp === "me" ? profile.id : filtros.resp,
    unidadeId: filtros.unidadeId,
  });
  const canMove = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutro-200 bg-card px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="font-display text-lg font-bold">Funil</h1>
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
