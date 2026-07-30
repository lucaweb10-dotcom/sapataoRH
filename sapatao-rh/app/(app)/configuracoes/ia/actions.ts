"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  CARGOS_PADRAO,
  criteriosCargoSchema,
  criteriosGeraisSchema,
  DEFAULT_CRITERIOS,
  type CriteriosCargo,
  type CriteriosGerais,
} from "@/lib/cv/criterios-shared";
import { cargoNomeSchema, integracaoIaSchema } from "@/lib/validations/ia";
import { triagemConfigSchema } from "@/lib/triagem/config";
import { getIaConfig } from "@/lib/llm/config";
import { getLlmProvider } from "@/lib/llm/factory";
import { LlmError } from "@/lib/llm/types";
import type { IaCriterios, Profile } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

async function revalidar() {
  revalidatePath("/configuracoes/ia");
}

/**
 * Salva a integração OpenAI (chave/modelo/limite). A CHAVE só transita e é
 * gravada via service role (coluna sem grant p/ authenticated); vazio = manter.
 * Marca provider='openai' — a partir daí a empresa usa IA real.
 */
export async function salvarIntegracao(input: {
  apiKey: string | null;
  modelo: string;
  limiteTokensMes: number | null;
}): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const parsed = integracaoIaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("ia_criterios")
    .select("id, openai_api_key")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  // Primeira gravação exige a chave (depois, vazio = manter a salva).
  if (!existing?.openai_api_key && !parsed.data.apiKey) {
    return { ok: false, error: "chave_obrigatoria" };
  }

  const fields: Partial<IaCriterios> = {
    provider: "openai",
    modelo: parsed.data.modelo,
    limite_tokens_mes: parsed.data.limiteTokensMes,
  };
  if (parsed.data.apiKey) fields.openai_api_key = parsed.data.apiKey;

  const { error } = existing
    ? await admin.from("ia_criterios").update(fields).eq("id", existing.id)
    : await admin.from("ia_criterios").insert({
        empresa_id: profile.empresa_id,
        prompt_base: DEFAULT_CRITERIOS.prompt_base,
        criterios: { versao: 2, nao_eliminar: [], distancia_max: "", unidades: [], contexto: "" },
        ...fields,
      });
  if (error) {
    console.error("[config/ia] salvarIntegracao:", error);
    return { ok: false, error: "db_error" };
  }
  await revalidar();
  return { ok: true };
}

/** Salva as respostas do questionário de critérios GERAIS (objeto v2). */
/**
 * Liga/desliga a triagem automática e grava sua config.
 *
 * O liga/desliga é o kill switch da empresa (trava 7): com `ativa: false`,
 * nenhuma mensagem automática sai, nem para conversas já em andamento.
 */
export async function salvarTriagem(input: {
  ativa: boolean;
  config: unknown;
}): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const parsed = triagemConfigSchema.safeParse(input.config);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("ia_criterios")
    .select("id")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const fields = { triagem_ativa: input.ativa, triagem_config: parsed.data };
  const { error } = existing
    ? await admin.from("ia_criterios").update(fields).eq("id", existing.id)
    : await admin.from("ia_criterios").insert({
        empresa_id: profile.empresa_id,
        prompt_base: DEFAULT_CRITERIOS.prompt_base,
        ...fields,
      });

  if (error) return { ok: false, error: error.message };
  await revalidar();
  return { ok: true };
}

/**
 * Desliga a triagem em UMA conversa (botão no chat). Não volta sozinha: é o
 * gestor que reativa. Mesma semântica da trava 6.
 */
export async function alternarTriagemDaConversa(
  conversationId: string,
  ativa: boolean,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "rh" && !profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }

  const admin = createAdminClient();
  const { data: conv } = await admin
    .from("conversations")
    .select("id, empresa_id, candidato_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return { ok: false, error: "nao_encontrada" };
  if (!profile.platform_admin && conv.empresa_id !== profile.empresa_id) {
    return { ok: false, error: "forbidden" };
  }

  const { data: existente } = await admin
    .from("ia_triagem")
    .select("id")
    .eq("conversation_id", conversationId)
    .maybeSingle();

  const { error } = existente
    ? await admin
        .from("ia_triagem")
        .update({
          ativa,
          motivo_parada: ativa ? null : "desligada_pelo_gestor",
          responder_em: null,
          // Reativar volta a conversa para o fluxo; o estado terminal sairia calado.
          ...(ativa ? { estado: "perguntando" as const } : {}),
        })
        .eq("id", existente.id)
    : await admin.from("ia_triagem").insert({
        empresa_id: conv.empresa_id,
        conversation_id: conversationId,
        candidato_id: conv.candidato_id,
        ativa,
        estado: ativa ? "perguntando" : "pausada",
        motivo_parada: ativa ? null : "desligada_pelo_gestor",
      });

  if (error) return { ok: false, error: error.message };
  revalidatePath("/chat");
  return { ok: true };
}

export async function salvarCriteriosGerais(input: CriteriosGerais): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const parsed = criteriosGeraisSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  // RLS write=admin; grants por coluna permitem criterios (a chave fica de fora).
  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("ia_criterios")
    .select("id")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const { error } = existing
    ? await supabase
        .from("ia_criterios")
        .update({ criterios: parsed.data as unknown as Record<string, unknown> })
        .eq("id", existing.id)
    : await supabase.from("ia_criterios").insert({
        empresa_id: profile.empresa_id,
        prompt_base: DEFAULT_CRITERIOS.prompt_base,
        criterios: parsed.data as unknown as Record<string, unknown>,
      });
  if (error) {
    console.error("[config/ia] salvarCriteriosGerais:", error);
    return { ok: false, error: "db_error" };
  }
  await revalidar();
  return { ok: true };
}

/** Testa a chave salva com uma chamada mínima ao modelo configurado. */
export async function testarConexao(): Promise<
  { ok: true; modelo: string } | { ok: false; error: "sem_api_key" | "chave_invalida" | "ia_indisponivel" | "forbidden" }
> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const admin = createAdminClient();
  const cfg = await getIaConfig(admin, profile.empresa_id);
  if (cfg.provider !== "openai" || !cfg.apiKey) return { ok: false, error: "sem_api_key" };

  try {
    const llm = getLlmProvider(cfg);
    await llm.completeJson("Responda apenas com JSON.", 'Responda exatamente: {"ok":true}', {
      timeoutMs: 15_000,
    });
    return { ok: true, modelo: cfg.modelo };
  } catch (err) {
    if (err instanceof LlmError && err.code === "chave_invalida") {
      return { ok: false, error: "chave_invalida" };
    }
    return { ok: false, error: "ia_indisponivel" };
  }
}

// ─── Cargos ──────────────────────────────────────────────────────────────────

export async function criarCargo(input: {
  nome: string;
  criterios: CriteriosCargo;
}): Promise<ActionResult & { id?: string }> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const nome = cargoNomeSchema.safeParse(input.nome);
  const criterios = criteriosCargoSchema.safeParse(input.criterios);
  if (!nome.success || !criterios.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ia_cargos")
    .insert({
      empresa_id: profile.empresa_id,
      nome: nome.data,
      criterios: criterios.data as unknown as Record<string, unknown>,
    })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "nome_duplicado" };
    console.error("[config/ia] criarCargo:", error);
    return { ok: false, error: "db_error" };
  }
  await revalidar();
  return { ok: true, id: data?.id };
}

export async function atualizarCargo(
  id: string,
  input: { nome: string; criterios: CriteriosCargo },
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const nome = cargoNomeSchema.safeParse(input.nome);
  const criterios = criteriosCargoSchema.safeParse(input.criterios);
  if (!nome.success || !criterios.success) return { ok: false, error: "invalido" };

  // Defense-in-depth: carimba o tenant e detecta 0 linhas (update cross-tenant
  // barrado pela RLS não gera erro no supabase-js — sem isso viraria falso ok).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ia_cargos")
    .update({ nome: nome.data, criterios: criterios.data as unknown as Record<string, unknown> })
    .eq("id", id)
    .eq("empresa_id", profile.empresa_id)
    .select("id")
    .maybeSingle();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "nome_duplicado" };
    console.error("[config/ia] atualizarCargo:", error);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "not_found" };
  await revalidar();
  return { ok: true };
}

export async function alternarCargoAtivo(id: string, ativo: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("ia_cargos")
    .update({ ativo })
    .eq("id", id)
    .eq("empresa_id", profile.empresa_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[config/ia] alternarCargoAtivo:", error);
    return { ok: false, error: "db_error" };
  }
  if (!data) return { ok: false, error: "not_found" };
  await revalidar();
  return { ok: true };
}

/** Cria os 4 cargos padrão de posto (pula os que já existem pelo nome). */
export async function criarCargosPadrao(): Promise<ActionResult & { criados?: number }> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data: existentes } = await supabase
    .from("ia_cargos")
    .select("nome")
    .eq("empresa_id", profile.empresa_id);
  const nomes = new Set((existentes ?? []).map((c) => c.nome.toLowerCase()));

  let criados = 0;
  for (const cargo of CARGOS_PADRAO) {
    if (nomes.has(cargo.nome.toLowerCase())) continue;
    const { error } = await supabase.from("ia_cargos").insert({
      empresa_id: profile.empresa_id,
      nome: cargo.nome,
      criterios: cargo.criterios as unknown as Record<string, unknown>,
    });
    if (error) {
      if (error.code === "23505") continue; // corrida com o pre-check: já existe, segue
      console.error("[config/ia] criarCargosPadrao:", error);
      return { ok: false, error: "db_error" };
    }
    criados++;
  }
  await revalidar();
  return { ok: true, criados };
}
