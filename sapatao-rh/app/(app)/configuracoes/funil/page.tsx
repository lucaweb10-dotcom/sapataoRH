import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas } from "@/lib/funil/queries";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { FunilEditor } from "@/components/configuracoes/funil-editor";

export const dynamic = "force-dynamic";

export default async function FunilConfigPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const funil = await getFunilComEtapas();

  // contagem de candidatos por etapa (RLS escopa por empresa)
  const supabase = await createClient();
  const { data: cands } = await supabase.from("candidatos").select("etapa_id");
  const counts: Record<string, number> = {};
  for (const c of cands ?? []) {
    if (c.etapa_id) counts[c.etapa_id] = (counts[c.etapa_id] ?? 0) + 1;
  }

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Funil</h1>
        <p className="text-sm text-neutro-700">
          Etapas do funil de recrutamento. Arraste para reordenar; edite ou exclua cada etapa.
        </p>
      </div>
      <div className="mt-6">
        {funil && funil.etapas.length > 0 ? (
          <FunilEditor funilId={funil.funil.id} etapas={funil.etapas} counts={counts} />
        ) : (
          <p className="text-sm text-neutro-700">Nenhum funil configurado para esta empresa.</p>
        )}
      </div>
    </PageContainer>
  );
}
