import { LlmError, type LlmProvider } from "./types";
import { mockProvider } from "./mock";
import { createOpenAiProvider } from "./openai";
import { DEFAULT_OPENAI_MODEL } from "./modelos";
import type { IaConfig } from "./config";

/**
 * Resolves the LLM provider. Without a config, falls back to `LLM_PROVIDER`
 * (default "mock") — tests and dev keep working with zero setup. With a per-empresa
 * config (getIaConfig), "openai" requires a key (from the empresa row or env).
 */
export function getLlmProvider(config?: IaConfig): LlmProvider {
  const provider = config?.provider ?? (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  if (provider === "mock") return mockProvider;
  if (provider === "openai") {
    const apiKey = config?.apiKey ?? process.env.OPENAI_API_KEY?.trim() ?? null;
    if (!apiKey) throw new LlmError("chave_invalida", "Chave OpenAI não configurada.");
    return createOpenAiProvider({ apiKey, modelo: config?.modelo ?? DEFAULT_OPENAI_MODEL });
  }
  throw new Error(`LLM_PROVIDER='${provider}' não suportado. Use 'mock' ou 'openai'.`);
}
