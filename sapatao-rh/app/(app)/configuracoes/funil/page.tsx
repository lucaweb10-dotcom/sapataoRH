import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listFunis } from "@/lib/funil/queries";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { FunilEditor } from "@/components/configuracoes/funil-editor";
import { FunilSwitcher } from "@/components/configuracoes/funil-switcher";

export const dynamic = "force-dynamic";

export default async function FunilConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const sp = await searchParams;
  const funilParam = typeof sp.f === "string" ? sp.f : null;

  // SP7: múltiplos funis — o Geral (default) é o template; ?f= escolhe o editado.
  const funis = await listFunis();
  const selecionadoResumo = (funilParam && funis.find((f) => f.id === funilParam)) || funis[0] || null;
  const funil = selecionadoResumo ? await getFunilComEtapas(selecionadoResumo.id) : null;

  const supabase = await createClient();
  const [{ data: cands }, { data: unidadesRows }] = await Promise.all([
    supabase.from("candidatos").select("etapa_id"),
    supabase
      .from("unidades")
      .select("id, nome")
      .eq("empresa_id", profile.empresa_id)
      .eq("ativa", true)
      .order("nome"),
  ]);
  const counts: Record<string, number> = {};
  for (const c of cands ?? []) {
    if (c.etapa_id) counts[c.etapa_id] = (counts[c.etapa_id] ?? 0) + 1;
  }
  const comFunil = new Set(funis.map((f) => f.unidade_id).filter(Boolean));
  const unidadesSemFunil = ((unidadesRows ?? []) as { id: string; nome: string }[]).filter(
    (u) => !comFunil.has(u.id),
  );

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-1">
        <h1 className="font-display text-display font-bold">Funil</h1>
        <p className="text-sm text-muted-foreground">
          O funil Geral é o template da empresa (e recebe candidatos sem unidade). Cada unidade
          pode ter o próprio funil, criado a partir dele e ajustado à vontade.
        </p>
      </div>

      <div className="mt-6 space-y-4">
        {funis.length > 0 && funil && (
          <FunilSwitcher
            funis={funis}
            funilSelecionadoId={funil.funil.id}
            unidadesSemFunil={unidadesSemFunil}
          />
        )}

        {funil && funil.etapas.length > 0 ? (
          <FunilEditor funilId={funil.funil.id} etapas={funil.etapas} counts={counts} />
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum funil configurado para esta empresa.</p>
        )}
      </div>
    </PageContainer>
  );
}
