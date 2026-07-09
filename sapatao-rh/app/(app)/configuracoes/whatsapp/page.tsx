import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { WhatsappInstancePanel } from "./whatsapp-instance-panel";
import { CredenciaisForm } from "./credenciais-form";
import { WebhookPanel } from "./webhook-panel";
import type { WhatsappStatus, WhatsappWebhookEvent } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  // Service role: lê credenciais mas passa ao client APENAS derivados não-sensíveis.
  const admin = createAdminClient();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select(
      "status, phone_number, uazapi_instance_id, uazapi_base_url, uazapi_admin_token, webhook_public_url",
    )
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const tokenMascarado = inst?.uazapi_admin_token
    ? `••••${inst.uazapi_admin_token.slice(-4)}`
    : null;

  // Eventos via RLS (policy: admin do tenant).
  const supabase = await createClient();
  const { data: eventos } = await supabase
    .from("whatsapp_webhook_events")
    .select("id, created_at, event, parsed_kind, payload")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-2xl font-bold">WhatsApp</h1>
          <p className="text-sm text-neutro-700 mt-1">
            Conecte o número de WhatsApp da empresa para receber candidaturas.
          </p>
        </div>

        <CredenciaisForm baseUrl={inst?.uazapi_base_url ?? null} tokenMascarado={tokenMascarado} />

        <WhatsappInstancePanel
          initialStatus={(inst?.status as WhatsappStatus) ?? "desconectado"}
          initialPhone={inst?.phone_number ?? null}
        />

        <WebhookPanel
          publicUrl={inst?.webhook_public_url ?? null}
          instanciaProvisionada={!!inst?.uazapi_instance_id}
          eventos={(eventos ?? []) as Pick<WhatsappWebhookEvent, "id" | "created_at" | "event" | "parsed_kind" | "payload">[]}
        />
      </div>
    </PageContainer>
  );
}
