import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { PageHeader } from "@/components/ui/page-header";
import { PageContainer } from "@/components/shell/page-container";
import { SimuladorTriagem } from "./simulador";

export const metadata = { title: "Simulador da triagem" };

export default async function DevTriagemPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) redirect("/");

  return (
    <PageContainer>
      <PageHeader
        title="Simulador da triagem"
        description="Converse como se fosse o candidato. Nada é enviado pelo WhatsApp e nada é gravado no histórico real."
      />
      <SimuladorTriagem />
    </PageContainer>
  );
}
