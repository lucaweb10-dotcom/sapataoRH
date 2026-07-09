import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { FuncionarioStatusBadge } from "@/components/funcionarios/status-badge";
import { FuncionarioAcoes } from "@/components/funcionarios/ficha-acoes";
import { OcorrenciasCard } from "@/components/funcionarios/ocorrencias-card";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFuncionario, listOcorrencias } from "@/lib/funcionarios/queries";
import { formatarCpf } from "@/lib/funcionarios/cpf";
import { dataBr } from "@/lib/shared/datas";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Info({ label, value }: { label: string; value: string | number | null | undefined }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div>
      <dt className="text-xs font-medium text-neutro-700">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutro-900">{value}</dd>
    </div>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutro-200 bg-card p-4 shadow-warm">
      <h2 className="mb-3 text-sm font-semibold text-neutro-900">{titulo}</h2>
      {children}
    </section>
  );
}

export default async function FuncionarioFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [funcionario, ocorrencias] = await Promise.all([
    getFuncionario(id),
    listOcorrencias(id),
  ]);
  if (!funcionario) notFound();

  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  const salarioBr =
    funcionario.salario === null
      ? null
      : funcionario.salario.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <PageContainer>
      <Link
        href="/funcionarios"
        className="inline-flex items-center gap-1.5 text-sm text-neutro-700 hover:text-neutro-900"
      >
        <ArrowLeft className="size-4" />
        Funcionários
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold">{funcionario.nome_completo}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutro-700">
            <span>
              {funcionario.cargo}
              {funcionario.unidade_nome && <> · {funcionario.unidade_nome}</>}
            </span>
            <FuncionarioStatusBadge status={funcionario.status} />
            <span className="text-xs text-neutro-500">
              Admissão {dataBr(funcionario.data_admissao)}
              {funcionario.data_demissao && <> · Desligamento {dataBr(funcionario.data_demissao)}</>}
            </span>
          </div>
        </div>

        <FuncionarioAcoes
          funcionarioId={funcionario.id}
          nome={funcionario.nome_completo}
          status={funcionario.status}
          canEdit={canEdit}
        />
      </div>

      {/* Corpo */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Secao titulo="Dados pessoais">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="CPF" value={formatarCpf(funcionario.cpf)} />
              <Info label="RG" value={funcionario.rg} />
              <Info label="Nascimento" value={dataBr(funcionario.data_nascimento)} />
              <Info label="Telefone" value={funcionario.telefone} />
              <Info label="E-mail" value={funcionario.email} />
              <Info label="CEP" value={funcionario.cep} />
              <Info label="Endereço" value={funcionario.endereco} />
            </dl>
          </Secao>

          <Secao titulo="Dados profissionais">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Cargo" value={funcionario.cargo} />
              <Info label="Unidade" value={funcionario.unidade_nome} />
              <Info label="Admissão" value={dataBr(funcionario.data_admissao)} />
              <Info label="Desligamento" value={dataBr(funcionario.data_demissao)} />
              <Info label="Salário" value={canEdit ? salarioBr : null} />
              <Info label="Jornada" value={funcionario.jornada} />
            </dl>
            {funcionario.candidato_origem_id && (
              <p className="mt-3 text-xs text-neutro-500">
                Veio do funil de recrutamento:{" "}
                <Link
                  href={`/candidatos/${funcionario.candidato_origem_id}`}
                  className="font-medium text-brand-700 hover:underline"
                >
                  {funcionario.candidato_nome ?? "ver candidato"}
                </Link>
              </p>
            )}
          </Secao>
        </div>

        <Secao titulo="Ocorrências">
          <OcorrenciasCard
            funcionarioId={funcionario.id}
            ocorrencias={ocorrencias}
            canEdit={canEdit}
          />
        </Secao>
      </div>
    </PageContainer>
  );
}
