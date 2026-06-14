import type { LlmProvider } from "./types";
import { mockProvider } from "./mock";

/**
 * Resolves the LLM provider from `LLM_PROVIDER` (default "mock"). Real providers
 * (anthropic/openai) are reserved for SP3b — plugging a client key there must not
 * change the pipeline. Until then, selecting them fails loudly.
 */
export function getLlmProvider(): LlmProvider {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();
  if (provider === "mock") return mockProvider;
  throw new Error(
    `LLM_PROVIDER='${provider}' não configurado nesta versão. Use 'mock' (ou plugue o provider real na SP3b).`,
  );
}
