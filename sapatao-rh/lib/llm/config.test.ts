import { describe, it, expect } from "vitest";
import { resolveIaConfig } from "./config";
import { DEFAULT_OPENAI_MODEL } from "./modelos";

type Row = Parameters<typeof resolveIaConfig>[0];

function makeRow(over: Partial<NonNullable<Row>> = {}): NonNullable<Row> {
  return {
    provider: null,
    openai_api_key: null,
    modelo: null,
    limite_tokens_mes: null,
    ...over,
  };
}

describe("resolveIaConfig", () => {
  it("banco tem precedência sobre env para provider e apiKey", () => {
    const cfg = resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk-banco" }), {
      provider: "mock",
      apiKey: "sk-env",
    });
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKey).toBe("sk-banco");
  });

  it("provider null no banco cai para o env ('openai')", () => {
    const cfg = resolveIaConfig(makeRow(), { provider: "openai", apiKey: "sk-env" });
    expect(cfg.provider).toBe("openai");
    expect(cfg.apiKey).toBe("sk-env");
  });

  it("provider null + env ausente → mock", () => {
    const cfg = resolveIaConfig(makeRow(), {});
    expect(cfg).toEqual({ provider: "mock", apiKey: null, modelo: "mock", limiteTokensMes: null });
  });

  it("row null inteiro + env ausente → mock", () => {
    const cfg = resolveIaConfig(null, {});
    expect(cfg.provider).toBe("mock");
    expect(cfg.apiKey).toBeNull();
    expect(cfg.modelo).toBe("mock");
  });

  it("provider mock → apiKey null e modelo 'mock' (mesmo com chave/modelo na linha)", () => {
    const cfg = resolveIaConfig(makeRow({ provider: "mock", openai_api_key: "sk-x", modelo: "gpt-5.6-sol" }), {
      apiKey: "sk-env",
    });
    expect(cfg.provider).toBe("mock");
    expect(cfg.apiKey).toBeNull();
    expect(cfg.modelo).toBe("mock");
  });

  it("modelo null com provider openai → DEFAULT_OPENAI_MODEL", () => {
    const cfg = resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk", modelo: null }), {});
    expect(cfg.modelo).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("modelo 'mock' (resquício) com provider openai → DEFAULT_OPENAI_MODEL", () => {
    const cfg = resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk", modelo: "mock" }), {});
    expect(cfg.modelo).toBe(DEFAULT_OPENAI_MODEL);
  });

  it("modelo custom é preservado", () => {
    const cfg = resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk", modelo: "gpt-5.6-luna" }), {});
    expect(cfg.modelo).toBe("gpt-5.6-luna");
  });

  it("limite_tokens_mes é repassado (openai e mock)", () => {
    expect(
      resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk", limite_tokens_mes: 500_000 }), {})
        .limiteTokensMes,
    ).toBe(500_000);
    expect(resolveIaConfig(makeRow({ provider: "mock", limite_tokens_mes: 123 }), {}).limiteTokensMes).toBe(123);
    expect(resolveIaConfig(makeRow(), {}).limiteTokensMes).toBeNull();
  });

  it("strings vazias/whitespace são tratadas como ausentes", () => {
    // provider "  " no banco → cai para o env
    expect(resolveIaConfig(makeRow({ provider: "  " }), { provider: "openai", apiKey: "sk" }).provider).toBe(
      "openai",
    );
    // provider "" no banco e "" no env → mock
    expect(resolveIaConfig(makeRow({ provider: "" }), { provider: "" }).provider).toBe("mock");
    // apiKey "" no banco → cai para o env
    expect(
      resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "" }), { apiKey: "sk-env" }).apiKey,
    ).toBe("sk-env");
    // apiKey whitespace no banco e ausente no env → null
    expect(resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "   " }), {}).apiKey).toBeNull();
    // modelo whitespace → default
    expect(resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "sk", modelo: "   " }), {}).modelo).toBe(
      DEFAULT_OPENAI_MODEL,
    );
  });

  it("apiKey com espaços nas pontas é trimada", () => {
    expect(
      resolveIaConfig(makeRow({ provider: "openai", openai_api_key: "  sk-abc  " }), {}).apiKey,
    ).toBe("sk-abc");
  });
});
