import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, FileText, UserRoundCheck } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/shared/score-badge";
import { StatusBadge } from "@/components/candidatos/status-badge";
import { FichaAcoes } from "@/components/candidatos/ficha-acoes";
import { NotasCard } from "@/components/candidatos/notas-card";
import { TempoChip } from "@/components/candidatos/tempo-chip";
import { ParecerView, type ParecerOrigem } from "@/components/cv/parecer-view";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, getHistorico } from "@/lib/funil/queries";
import { getCandidatoFicha, getEntrevistaVigente } from "@/lib/candidatos/queries";
import { getFuncionarioDoCandidato } from "@/lib/funcionarios/queries";
import type { Entrevista } from "@/types/database";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

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

export default async function CandidatoFichaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const [candidato, funil, historico, entrevista] = await Promise.all([
    getCandidatoFicha(id),
    getFunilComEtapas(),
    getHistorico(id),
    getEntrevistaVigente(id) as Promise<Entrevista | null>,
  ]);
  if (!candidato) notFound();

  // Contratado → promoção a funcionário (PRD 9.5).
  const funcionarioVinculado =
    candidato.status === "contratado" ? await getFuncionarioDoCandidato(id) : null;

  // Origem do parecer exibido (última análise ok — SP3b).
  let parecerOrigem: ParecerOrigem | null = null;
  if (candidato.parecer_ia) {
    const supabase = await createClient();
    const { data: ultimaOk } = await supabase
      .from("cv_analises")
      .select("origem, cargo_nome, modelo, created_at")
      .eq("candidato_id", id)
      .eq("status", "ok")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (ultimaOk) {
      parecerOrigem = {
        fonte: ultimaOk.origem === "perfil" ? "perfil" : "cv",
        quando: ultimaOk.created_at,
        modelo: ultimaOk.modelo,
        cargo: ultimaOk.cargo_nome,
      };
    }
  }

  const etapas = funil?.etapas ?? [];
  const etapaAtual = etapas.find((e) => e.id === candidato.etapa_id) ?? null;
  const nomeEtapa = (etapaId: string | null) =>
    etapas.find((e) => e.id === etapaId)?.nome ?? "—";
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <PageContainer>
      <Link
        href="/candidatos"
        className="inline-flex items-center gap-1.5 text-sm text-neutro-700 hover:text-neutro-900"
      >
        <ArrowLeft className="size-4" />
        Candidatos
      </Link>

      {/* Header */}
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <Avatar className="size-14">
            {candidato.avatar_url && (
              <AvatarImage src={candidato.avatar_url} alt={candidato.nome} />
            )}
            <AvatarFallback className="bg-brand-700 text-lg font-semibold text-neutro-50">
              {initials(candidato.nome)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="font-display text-2xl font-bold">{candidato.nome}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-neutro-700">
              <span>{candidato.telefone}</span>
              <StatusBadge status={candidato.status} />
              {etapaAtual && (
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: etapaAtual.cor }}
                  />
                  {etapaAtual.nome}
                  <TempoChip desde={candidato.etapa_entrou_em} />
                </span>
              )}
              <ScoreBadge score={candidato.score_ia} />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {candidato.status === "contratado" && canEdit && (
            <Button
              size="sm"
              render={
                <Link
                  href={
                    funcionarioVinculado
                      ? `/funcionarios/${funcionarioVinculado.id}`
                      : `/funcionarios/novo?candidato=${candidato.id}`
                  }
                />
              }
            >
              <UserRoundCheck className="size-3.5" />
              {funcionarioVinculado ? "Ver funcionário" : "Cadastrar como funcionário"}
            </Button>
          )}
          <FichaAcoes
            candidatoId={candidato.id}
            nome={candidato.nome}
            etapaId={candidato.etapa_id}
            conversationId={candidato.conversationId}
            etapas={etapas}
            canEdit={canEdit}
            temEntrevista={!!entrevista}
          />
        </div>
      </div>

      {/* Corpo em 2 colunas */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Secao titulo="Dados pessoais">
            <dl className="grid grid-cols-2 gap-3">
              <Info label="Telefone" value={candidato.telefone} />
              <Info label="Idade" value={candidato.idade} />
              <Info label="CEP" value={candidato.cep} />
              <Info label="Endereço" value={candidato.endereco} />
              <Info
                label="Veículo próprio"
                value={
                  candidato.tem_veiculo === null ? null : candidato.tem_veiculo ? "Sim" : "Não"
                }
              />
              <Info label="Vaga de interesse" value={candidato.vaga_interesse} />
              <Info label="Origem" value={candidato.origem} />
              <Info
                label="Cadastrado em"
                value={new Date(candidato.created_at).toLocaleDateString("pt-BR")}
              />
            </dl>

            {candidato.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {candidato.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-neutro-200 bg-neutro-50 px-2 py-0.5 text-xs text-neutro-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            )}
          </Secao>

          <Secao titulo="Notas internas">
            <NotasCard
              candidatoId={candidato.id}
              notas={candidato.notas_internas}
              canEdit={canEdit}
            />
          </Secao>
        </div>

        <div className="space-y-4">
          <Secao titulo="Análise de IA">
            <ParecerView parecer={candidato.parecer_ia} score={candidato.score_ia} origem={parecerOrigem} />
            {candidato.curriculo_url && (
              <a
                href={candidato.curriculo_url}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-700 hover:underline"
              >
                <FileText className="size-4" />
                Ver currículo
              </a>
            )}
          </Secao>

          {entrevista && (
            <Secao titulo="Entrevista agendada">
              <p className="text-sm font-medium text-neutro-900">
                {new Date(entrevista.data_hora).toLocaleString("pt-BR", {
                  dateStyle: "long",
                  timeStyle: "short",
                })}
              </p>
              <p className="text-sm capitalize text-neutro-700">{entrevista.formato}</p>
              {entrevista.local_ou_link && (
                <p className="mt-0.5 truncate text-sm text-neutro-700">
                  {entrevista.local_ou_link}
                </p>
              )}
              {entrevista.observacoes && (
                <p className="mt-1 text-sm text-neutro-700">{entrevista.observacoes}</p>
              )}
            </Secao>
          )}

          <Secao titulo="Histórico de etapas">
            {historico.length === 0 ? (
              <p className="text-sm text-neutro-700">Sem movimentações registradas.</p>
            ) : (
              <ul className="space-y-1.5">
                {historico.map((h) => (
                  <li key={h.id} className="text-xs text-neutro-700">
                    <span className="text-neutro-900">{nomeEtapa(h.de_etapa)}</span> →{" "}
                    <span className="text-neutro-900">{nomeEtapa(h.para_etapa)}</span>
                    {h.movido_por_nome && <> · {h.movido_por_nome}</>}
                    <span className="text-neutro-700">
                      {" "}
                      · {new Date(h.created_at).toLocaleString("pt-BR")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </div>
    </PageContainer>
  );
}
