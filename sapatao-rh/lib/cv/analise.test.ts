import { describe, it, expect, vi } from "vitest";
import { analisarCurriculo, type AnaliseDeps } from "./analise";

const validParecer = {
  score: 72,
  verdict: "apto",
  criterios_atendidos: [],
  pontos_fortes: [],
  pontos_atencao: [],
  experiencia_relevante: "x",
  resumo: "y",
  perguntas_sugeridas_entrevista: [],
};

const input = {
  empresaId: "emp-1",
  candidatoId: "c-1",
  cvPath: "emp-1/c-1/cv.pdf",
  vagaInteresse: "Frentista",
  movidoPor: "u-1",
};

function makeDeps(over: Partial<AnaliseDeps> = {}): AnaliseDeps {
  return {
    getCvFile: vi.fn(async () => ({ buffer: Buffer.from("pdf"), mime: "application/pdf" })),
    extractText: vi.fn(async () => "texto do curriculo"),
    getCriterios: vi.fn(async () => ({ prompt_base: "b", criterios: ["x"], modelo: "mock" })),
    llmJson: vi.fn(async () => ({ json: JSON.stringify(validParecer), tokensEst: 100 })),
    persist: vi.fn(async () => ({ error: null })),
    registrarAnalise: vi.fn(async () => ({ error: null })),
    moverParaAnaliseConcluida: vi.fn(async () => {}),
    ...over,
  };
}

describe("analisarCurriculo", () => {
  it("sucesso: persiste, loga ok e move", async () => {
    const deps = makeDeps();
    const r = await analisarCurriculo(input, deps);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score).toBe(72);
    expect(deps.persist).toHaveBeenCalledWith("c-1", 72, expect.objectContaining({ score: 72 }));
    expect(deps.moverParaAnaliseConcluida).toHaveBeenCalledWith("c-1");
    expect(deps.registrarAnalise).toHaveBeenCalledWith(expect.objectContaining({ status: "ok" }));
  });

  it("arquivo ausente -> arquivo_invalido (não persiste nem move)", async () => {
    const deps = makeDeps({ getCvFile: vi.fn(async () => null) });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "arquivo_invalido" });
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.moverParaAnaliseConcluida).not.toHaveBeenCalled();
  });

  it("extração lança -> arquivo_invalido", async () => {
    const deps = makeDeps({
      extractText: vi.fn(async () => {
        throw new Error("formato");
      }),
    });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "arquivo_invalido" });
  });

  it("texto vazio -> texto_vazio (não chama a IA)", async () => {
    const deps = makeDeps({ extractText: vi.fn(async () => "   ") });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "texto_vazio" });
    expect(deps.llmJson).not.toHaveBeenCalled();
  });

  it("LLM lança -> ia_indisponivel", async () => {
    const deps = makeDeps({
      llmJson: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "ia_indisponivel" });
  });

  it("JSON inválido -> parecer_invalido (não persiste)", async () => {
    const deps = makeDeps({ llmJson: vi.fn(async () => ({ json: "{quebrado", tokensEst: 1 })) });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "parecer_invalido" });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("persist falha -> persist_falhou (não move, loga status)", async () => {
    const deps = makeDeps({ persist: vi.fn(async () => ({ error: { message: "boom" } })) });
    expect(await analisarCurriculo(input, deps)).toEqual({ ok: false, error: "persist_falhou" });
    expect(deps.moverParaAnaliseConcluida).not.toHaveBeenCalled();
    expect(deps.registrarAnalise).toHaveBeenCalledWith(expect.objectContaining({ status: "persist_falhou" }));
  });

  it("erro ao mover é best-effort: não derruba o resultado ok", async () => {
    const deps = makeDeps({
      moverParaAnaliseConcluida: vi.fn(async () => {
        throw new Error("move fail");
      }),
    });
    expect((await analisarCurriculo(input, deps)).ok).toBe(true);
  });

  it("erro ao auditar é best-effort: não derruba o resultado ok", async () => {
    const deps = makeDeps({
      registrarAnalise: vi.fn(async () => {
        throw new Error("log fail");
      }),
    });
    expect((await analisarCurriculo(input, deps)).ok).toBe(true);
  });
});
