import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getLlmProvider } from "./factory";
import { mockProvider } from "./mock";
import { LlmError } from "./types";
import type { IaConfig } from "./config";

function cfg(over: Partial<IaConfig> = {}): IaConfig {
  return { provider: "mock", apiKey: null, modelo: "mock", limiteTokensMes: null, ...over };
}

describe("getLlmProvider", () => {
  beforeEach(() => {
    // Garante env limpo — nenhum vazamento da máquina/CI.
    vi.stubEnv("LLM_PROVIDER", undefined);
    vi.stubEnv("OPENAI_API_KEY", undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sem arg e sem env → mockProvider (modelo 'mock')", () => {
    const p = getLlmProvider();
    expect(p).toBe(mockProvider);
    expect(p.modelo).toBe("mock");
  });

  it("config provider mock → mockProvider", () => {
    expect(getLlmProvider(cfg({ provider: "mock" }))).toBe(mockProvider);
  });

  it("config openai sem apiKey e SEM env → lança LlmError chave_invalida", () => {
    let err: unknown;
    try {
      getLlmProvider(cfg({ provider: "openai", apiKey: null, modelo: "gpt-5.6-terra" }));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe("chave_invalida");
  });

  it("config openai com apiKey → provider real com o modelo da config", () => {
    const p = getLlmProvider(cfg({ provider: "openai", apiKey: "sk-abc", modelo: "gpt-5.6-luna" }));
    expect(p.modelo).toBe("gpt-5.6-luna");
    expect(p).not.toBe(mockProvider);
  });

  it("config openai sem apiKey mas com env OPENAI_API_KEY → usa a chave do env", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-env");
    const p = getLlmProvider(cfg({ provider: "openai", apiKey: null, modelo: "gpt-5.6-terra" }));
    expect(p.modelo).toBe("gpt-5.6-terra");
  });
});
