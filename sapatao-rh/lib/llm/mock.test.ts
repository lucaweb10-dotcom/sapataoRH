import { describe, it, expect } from "vitest";
import { mockProvider } from "./mock";
import { getLlmProvider } from "./factory";
import { parseParecer } from "@/lib/cv/parecer";

describe("mockProvider", () => {
  it("é determinístico (mesma entrada → mesma saída)", async () => {
    const a = await mockProvider.completeJson("s", "curriculo abc");
    const b = await mockProvider.completeJson("s", "curriculo abc");
    expect(a.json).toBe(b.json);
  });
  it("retorna um parecer válido pelo schema + tokensEst > 0", async () => {
    const r = await mockProvider.completeJson("s", "João, 25 anos, experiência em atendimento");
    expect(r.tokensEst).toBeGreaterThan(0);
    expect(parseParecer(r.json)).not.toBeNull();
  });
  it("varia o score entre entradas diferentes", async () => {
    const a = parseParecer((await mockProvider.completeJson("s", "texto um")).json)!;
    const b = parseParecer((await mockProvider.completeJson("s", "outro texto bem diferente")).json)!;
    expect(a.score === b.score && a.resumo === b.resumo).toBe(false);
  });
});

describe("getLlmProvider", () => {
  it("default = mock", () => {
    const prev = process.env.LLM_PROVIDER;
    delete process.env.LLM_PROVIDER;
    expect(getLlmProvider().modelo).toBe("mock");
    if (prev !== undefined) process.env.LLM_PROVIDER = prev;
  });
  it("provider não suportado lança", () => {
    const prev = process.env.LLM_PROVIDER;
    process.env.LLM_PROVIDER = "anthropic";
    expect(() => getLlmProvider()).toThrow();
    if (prev !== undefined) process.env.LLM_PROVIDER = prev;
    else delete process.env.LLM_PROVIDER;
  });
});
