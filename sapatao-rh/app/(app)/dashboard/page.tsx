import { PageContainer } from "@/components/shell/page-container";
import { PageHeader } from "@/components/ui/page-header";
import { HojeCards } from "@/components/dashboard/hoje-cards";
import { EntrevistaProximas } from "@/components/dashboard/entrevistas-proximas";
import { CandidatosRecentes } from "@/components/dashboard/candidatos-recentes";
import {
  getDashboardResumo,
  getEntrevistaProximas,
  getCandidatosRecentes,
} from "@/lib/dashboard/queries";
import { getCurrentProfile } from "@/lib/auth/current-profile";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const profile = await getCurrentProfile();

  const [resumo, entrevistas, candidatos] = await Promise.all([
    getDashboardResumo(),
    getEntrevistaProximas(8),
    getCandidatosRecentes(8),
  ]);

  const hora = new Date().getHours();
  const saudacao = hora < 12 ? "Bom dia" : hora < 18 ? "Boa tarde" : "Boa noite";

  return (
    <PageContainer>
      <PageHeader
        title={`${saudacao}${profile?.nome ? `, ${profile.nome.split(" ")[0]}` : ""}!`}
        description={new Date().toLocaleDateString("pt-BR", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      />

      <div className="space-y-8">
        <HojeCards resumo={resumo} />

        <div className="grid gap-6 lg:grid-cols-2">
          <EntrevistaProximas entrevistas={entrevistas} />
          <CandidatosRecentes candidatos={candidatos} />
        </div>
      </div>
    </PageContainer>
  );
}
