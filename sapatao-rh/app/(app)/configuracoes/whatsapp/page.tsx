import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { WhatsappInstancePanel } from "./whatsapp-instance-panel";
import type { WhatsappStatus } from "@/types/database";

// Safe view shape (no uazapi_token)
interface WhatsappInstanceSafe {
  id: string;
  empresa_id: string;
  nome: string;
  uazapi_instance_id: string | null;
  status: WhatsappStatus;
  phone_number: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export default async function WhatsappPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  // Read from the safe view (no uazapi_token column)
  const supabase = await createClient();
  const { data: instanceData } = await supabase
    .from("whatsapp_instances_safe" as "whatsapp_instances")
    .select("*")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const instance = instanceData as WhatsappInstanceSafe | null;

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-6 max-w-lg">
        <div>
          <h1 className="font-display text-2xl font-bold">WhatsApp</h1>
          <p className="text-sm text-neutro-700 mt-1">
            Conecte o número de WhatsApp da empresa para receber candidaturas.
          </p>
        </div>

        <WhatsappInstancePanel
          initialStatus={instance?.status ?? "desconectado"}
          initialPhone={instance?.phone_number ?? null}
        />
      </div>
    </PageContainer>
  );
}
