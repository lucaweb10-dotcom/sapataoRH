import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listCandidatosDoFunil } from "@/lib/funil/queries";
import { Board } from "@/components/funil/board";

export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { u } = await searchParams;
  const unidadeId = typeof u === "string" ? u : null;

  const funil = await getFunilComEtapas();
  if (!funil || funil.etapas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutro-700">
        Nenhum funil configurado para esta empresa.
      </div>
    );
  }

  const etapaIds = funil.etapas.map((e) => e.id);
  const candidatos = await listCandidatosDoFunil(etapaIds, unidadeId);
  const canMove = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <Board
      etapas={funil.etapas}
      candidatos={candidatos}
      empresaId={profile.empresa_id}
      canMove={canMove}
    />
  );
}
