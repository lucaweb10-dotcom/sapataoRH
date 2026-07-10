import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { TemplatesEditor } from "@/components/configuracoes/templates-editor";
import type { MessageTemplate } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TemplatesConfigPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .order("categoria")
    .order("nome");
  const templates = (data ?? []) as MessageTemplate[];

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Templates</h1>
        <p className="text-sm text-neutro-700">
          Mensagens prontas do WhatsApp. As variáveis {"{{nome}}"}, {"{{vaga}}"} e {"{{unidade}}"}{" "}
          são preenchidas com os dados do candidato.
        </p>
      </div>
      <div className="mt-6 max-w-2xl">
        <TemplatesEditor templates={templates} />
      </div>
    </PageContainer>
  );
}
