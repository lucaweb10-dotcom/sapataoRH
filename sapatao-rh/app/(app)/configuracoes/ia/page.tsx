import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import {
  criteriosCargoSchema,
  criteriosGeraisSchema,
  type CriteriosGerais,
} from "@/lib/cv/criterios-shared";
import { DEFAULT_OPENAI_MODEL } from "@/lib/llm/modelos";
import type { CvAnalise, IaCargo } from "@/types/database";
import { IntegracaoForm } from "./integracao-form";
import { RadarCustosCard } from "./radar-custos-card";
import { CargosSection, type CargoConfig } from "./cargos-section";
import { CriteriosGeraisForm } from "./criterios-gerais-form";

export const dynamic = "force-dynamic";

const GERAIS_VAZIOS: CriteriosGerais = {
  versao: 2,
  nao_eliminar: [],
  distancia_max: "",
  unidades: [],
  contexto: "",
};

export default async function ConfigIaPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  // Service role: lê a linha inteira mas passa ao client APENAS derivados
  // não-sensíveis (a chave vira máscara ••••XXXX).
  const admin = createAdminClient();
  const { data: cfgRow } = await admin
    .from("ia_criterios")
    .select("openai_api_key, modelo, limite_tokens_mes, criterios")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const apiKeyMascarada = cfgRow?.openai_api_key ? `••••${cfgRow.openai_api_key.slice(-4)}` : null;
  const geraisParse = criteriosGeraisSchema.safeParse(cfgRow?.criterios);
  const gerais: CriteriosGerais = geraisParse.success ? geraisParse.data : GERAIS_VAZIOS;

  // RLS: cargos (inclusive inativos, p/ a seção de config) + consumo do mês.
  // Escopo explícito por empresa (defense-in-depth): sem isso, platform_admin
  // veria/editaria cargos e custos de TODOS os tenants misturados.
  const supabase = await createClient();
  const { data: cargosRows } = await supabase
    .from("ia_cargos")
    .select("id, nome, criterios, ativo")
    .eq("empresa_id", profile.empresa_id)
    .order("nome", { ascending: true });
  const cargos: CargoConfig[] = ((cargosRows ?? []) as Pick<IaCargo, "id" | "nome" | "criterios" | "ativo">[]).map(
    (row) => {
      const parsed = criteriosCargoSchema.safeParse(row.criterios);
      return {
        id: row.id,
        nome: row.nome,
        ativo: row.ativo,
        criterios: parsed.success ? parsed.data : criteriosCargoSchema.parse({}),
      };
    },
  );

  const agora = new Date();
  const inicioMes = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1)).toISOString();
  const { data: analisesRows } = await supabase
    .from("cv_analises")
    .select("score, status, origem, cargo_nome, modelo, tokens_est, custo_usd, created_at")
    .eq("empresa_id", profile.empresa_id)
    .gte("created_at", inicioMes)
    .order("created_at", { ascending: false });
  const analises = (analisesRows ?? []) as Pick<
    CvAnalise,
    "score" | "status" | "origem" | "cargo_nome" | "modelo" | "tokens_est" | "custo_usd" | "created_at"
  >[];

  const tokensUsados = analises.reduce((acc, a) => acc + (a.tokens_est ?? 0), 0);
  const custoMesUsd = analises.reduce((acc, a) => acc + (a.custo_usd === null ? 0 : Number(a.custo_usd)), 0);
  const analisesOk = analises.filter((a) => a.status === "ok");
  const dePerfilOk = analisesOk.filter((a) => a.origem === "perfil").length;

  const chaveConfigurada = !!apiKeyMascarada;
  const criteriosRespondidos =
    cargos.length > 0 ||
    gerais.nao_eliminar.length > 0 ||
    gerais.unidades.length > 0 ||
    gerais.distancia_max !== "" ||
    gerais.contexto !== "";
  const onboarding = !chaveConfigurada || !criteriosRespondidos;

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-display font-bold">Inteligência Artificial</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure como a IA avalia candidatos: a conexão com a OpenAI e os critérios de
            contratação da sua empresa.
          </p>
        </div>

        {onboarding && (
          <div className="rounded-lg border border-sapatao-verde/30 bg-sapatao-verde/5 p-4">
            <p className="flex items-center gap-1.5 text-sm font-medium text-sapatao-verde">
              <Sparkles className="size-4" />
              Ative a análise de perfis com IA em 3 passos
            </p>
            <ol className="mt-2 space-y-1 text-sm text-muted-foreground">
              <li>{chaveConfigurada ? "✓" : "○"} Cole a sua chave da OpenAI e escolha o modelo</li>
              <li>{criteriosRespondidos ? "✓" : "○"} Cadastre os cargos e responda às perguntas estratégicas</li>
              <li>
                ○ Use o botão &quot;Analisar perfil com IA&quot; no Atendimento ou &quot;Analisar
                Currículo&quot; nos anexos
              </li>
            </ol>
          </div>
        )}

        <IntegracaoForm
          apiKeyMascarada={apiKeyMascarada}
          modeloAtual={cfgRow?.modelo && cfgRow.modelo !== "mock" ? cfgRow.modelo : DEFAULT_OPENAI_MODEL}
          limiteAtual={cfgRow?.limite_tokens_mes ?? null}
        />

        <RadarCustosCard
          tokensUsados={tokensUsados}
          custoMesUsd={custoMesUsd}
          limite={cfgRow?.limite_tokens_mes ?? null}
          totalAnalises={analisesOk.length}
          dePerfilOk={dePerfilOk}
          ultimas={analises.slice(0, 5).map((a) => ({
            quando: a.created_at,
            origem: a.origem,
            cargo: a.cargo_nome,
            modelo: a.modelo,
            tokens: a.tokens_est,
            custoUsd: a.custo_usd === null ? null : Number(a.custo_usd),
            status: a.status,
          }))}
        />

        <CargosSection cargos={cargos} />

        <CriteriosGeraisForm gerais={gerais} cargosAtivos={cargos.filter((c) => c.ativo)} />
      </div>
    </PageContainer>
  );
}
