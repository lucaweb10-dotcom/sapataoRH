import Link from "next/link";
import type { DashboardResumo } from "@/lib/dashboard/queries";

function Card({
  titulo,
  valor,
  descricao,
  href,
  alerta,
}: {
  titulo: string;
  valor: number;
  descricao: string;
  href: string;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`block rounded-xl border p-5 transition-colors hover:bg-neutro-50 ${
        alerta && valor > 0 ? "border-red-200 bg-red-50" : "border-neutro-200 bg-white"
      }`}
    >
      <p className="text-xs font-medium uppercase tracking-wide text-neutro-700">{titulo}</p>
      <p
        className={`mt-1 text-3xl font-bold ${
          alerta && valor > 0 ? "text-red-600" : "text-neutro-900"
        }`}
      >
        {valor}
      </p>
      <p className="mt-0.5 text-xs text-neutro-700">{descricao}</p>
    </Link>
  );
}

export function HojeCards({ resumo }: { resumo: DashboardResumo }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <Card
        titulo="Candidatos hoje"
        valor={resumo.candidatos_hoje}
        descricao="entradas nas últimas 24h"
        href="/funil"
      />
      <Card
        titulo="Entrevistas (48h)"
        valor={resumo.entrevistas_48h}
        descricao="nas próximas 48 horas"
        href="/funil"
      />
      <Card
        titulo="Conversas abertas"
        valor={resumo.conversas_abertas}
        descricao="aguardando atendimento"
        href="/chat"
      />
      <Card
        titulo="SLA vencido"
        valor={resumo.sla_vencido}
        descricao="candidatos fora do prazo"
        href="/funil"
        alerta
      />
    </div>
  );
}
