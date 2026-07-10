// Resolve a config de IA da empresa: banco (ia_criterios) > env. Padrão lib/uazapi/config.ts.
import type { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_OPENAI_MODEL } from "./modelos";

export type IaConfig = {
  provider: "mock" | "openai";
  apiKey: string | null; // null quando provider=mock
  modelo: string;
  limiteTokensMes: number | null;
};

type IaRow = {
  provider: string | null;
  openai_api_key: string | null;
  modelo: string | null;
  limite_tokens_mes: number | null;
} | null;

type EnvLike = { provider?: string; apiKey?: string };

const clean = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null;

export function resolveIaConfig(row: IaRow, env: EnvLike): IaConfig {
  const provider = (clean(row?.provider) ?? clean(env.provider) ?? "mock").toLowerCase();
  const limiteTokensMes = row?.limite_tokens_mes ?? null;
  if (provider !== "openai") {
    return { provider: "mock", apiKey: null, modelo: "mock", limiteTokensMes };
  }
  const modeloRow = clean(row?.modelo);
  return {
    provider: "openai",
    apiKey: clean(row?.openai_api_key) ?? clean(env.apiKey),
    // 'mock' na coluna é resquício do default antigo — não é um modelo OpenAI.
    modelo: modeloRow && modeloRow !== "mock" ? modeloRow : DEFAULT_OPENAI_MODEL,
    limiteTokensMes,
  };
}

/** Lê a linha da empresa via service role (a API key não tem grant p/ authenticated). */
export async function getIaConfig(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: string,
): Promise<IaConfig> {
  const { data } = await admin
    .from("ia_criterios")
    .select("provider, openai_api_key, modelo, limite_tokens_mes")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return resolveIaConfig(data ?? null, {
    provider: process.env.LLM_PROVIDER,
    apiKey: process.env.OPENAI_API_KEY,
  });
}
