import { CalendarClock, MessagesSquare, TriangleAlert, UserPlus } from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import type { DashboardResumo } from "@/lib/dashboard/queries";

export function HojeCards({ resumo }: { resumo: DashboardResumo }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
      <StatCard
        label="Candidatos hoje"
        value={resumo.candidatos_hoje}
        hint="entradas nas últimas 24h"
        icon={<UserPlus />}
        href="/funil"
      />
      <StatCard
        label="Entrevistas (48h)"
        value={resumo.entrevistas_48h}
        hint="nas próximas 48 horas"
        icon={<CalendarClock />}
        href="/funil"
      />
      <StatCard
        label="Conversas abertas"
        value={resumo.conversas_abertas}
        hint="aguardando atendimento"
        icon={<MessagesSquare />}
        href="/chat"
      />
      <StatCard
        label="SLA vencido"
        value={resumo.sla_vencido}
        hint="candidatos fora do prazo"
        icon={<TriangleAlert />}
        tone={resumo.sla_vencido > 0 ? "danger" : "default"}
        href="/funil"
      />
    </div>
  );
}
