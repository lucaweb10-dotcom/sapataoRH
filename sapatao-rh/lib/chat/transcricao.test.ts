import { describe, it, expect, vi } from "vitest";
import {
  transcreverPendentes,
  MAX_AUDIOS_POR_ANALISE,
  TRANSCRICAO_PARALELISMO,
  PLACEHOLDER_SEM_TRANSCRICAO,
  type AudioPendente,
  type TranscricaoDeps,
} from "./transcricao";
import { LlmError } from "@/lib/llm/types";

function makeAudio(over: Partial<AudioPendente> = {}): AudioPendente {
  return {
    id: "a-1",
    midia_url: "path/a-1.ogg",
    transcricao: null,
    created_at: "2026-07-01T10:00:00Z",
    ...over,
  };
}

function makeDeps(over: Partial<TranscricaoDeps> = {}): TranscricaoDeps {
  return {
    baixarAudio: vi.fn(async (path: string) => ({ buffer: Buffer.from(path), mime: "audio/ogg" })),
    transcrever: vi.fn(async (a: { buffer: Buffer; mime: string }) => ({
      texto: `T:${a.buffer.toString()}`,
      tokens: 1,
    })),
    salvarCache: vi.fn(async () => ({ error: null })),
    ...over,
  };
}

describe("transcreverPendentes", () => {
  it("áudio com transcrição em cache entra no Map SEM transcrever", async () => {
    const deps = makeDeps();
    const r = await transcreverPendentes([makeAudio({ transcricao: "já transcrito" })], deps);
    expect(r.porMensagem.get("a-1")).toBe("já transcrito");
    expect(r.tokens).toBe(0);
    expect(deps.baixarAudio).not.toHaveBeenCalled();
    expect(deps.transcrever).not.toHaveBeenCalled();
    expect(deps.salvarCache).not.toHaveBeenCalled();
  });

  it("sem cache: baixa, transcreve, salva cache e soma tokens", async () => {
    const deps = makeDeps({
      transcrever: vi.fn(async (a) => ({ texto: `T:${a.buffer.toString()}`, tokens: 3 })),
    });
    const audios = [
      makeAudio({ id: "a-1", midia_url: "p1", created_at: "2026-07-01T10:00:00Z" }),
      makeAudio({ id: "a-2", midia_url: "p2", created_at: "2026-07-01T11:00:00Z" }),
    ];
    const r = await transcreverPendentes(audios, deps);
    expect(r.porMensagem.get("a-1")).toBe("T:p1");
    expect(r.porMensagem.get("a-2")).toBe("T:p2");
    expect(r.tokens).toBe(6);
    expect(deps.baixarAudio).toHaveBeenCalledWith("p1");
    expect(deps.baixarAudio).toHaveBeenCalledWith("p2");
    expect(deps.salvarCache).toHaveBeenCalledWith("a-1", "T:p1");
    expect(deps.salvarCache).toHaveBeenCalledWith("a-2", "T:p2");
  });

  it("falha individual (Error comum) → placeholder e salvarCache NÃO chamado p/ ele", async () => {
    const deps = makeDeps({
      transcrever: vi.fn(async (a) => {
        if (a.buffer.toString() === "p1") throw new Error("engasgou");
        return { texto: "ok2", tokens: 2 };
      }),
    });
    const audios = [makeAudio({ id: "a-1", midia_url: "p1" }), makeAudio({ id: "a-2", midia_url: "p2" })];
    const r = await transcreverPendentes(audios, deps);
    expect(r.porMensagem.get("a-1")).toBe(PLACEHOLDER_SEM_TRANSCRICAO);
    expect(r.porMensagem.get("a-2")).toBe("ok2");
    expect(r.tokens).toBe(2);
    expect(deps.salvarCache).toHaveBeenCalledTimes(1);
    expect(deps.salvarCache).toHaveBeenCalledWith("a-2", "ok2");
  });

  it("LlmError chave_invalida aborta a função inteira (rejeita)", async () => {
    const deps = makeDeps({
      transcrever: vi.fn(async () => {
        throw new LlmError("chave_invalida");
      }),
    });
    await expect(transcreverPendentes([makeAudio()], deps)).rejects.toMatchObject({
      name: "LlmError",
      code: "chave_invalida",
    });
  });

  it("acima do cap: só os 20 mais recentes são transcritos; o mais antigo vira placeholder", async () => {
    const deps = makeDeps();
    const audios = Array.from({ length: MAX_AUDIOS_POR_ANALISE + 1 }, (_, i) =>
      makeAudio({
        id: `a-${i}`,
        midia_url: `p${i}`,
        created_at: `2026-07-01T10:${String(i).padStart(2, "0")}:00Z`,
      }),
    );
    const r = await transcreverPendentes(audios, deps);
    expect(deps.transcrever).toHaveBeenCalledTimes(MAX_AUDIOS_POR_ANALISE);
    // a-0 é o mais antigo → fica de fora
    expect(r.porMensagem.get("a-0")).toBe(PLACEHOLDER_SEM_TRANSCRICAO);
    expect(deps.baixarAudio).not.toHaveBeenCalledWith("p0");
    for (let i = 1; i <= MAX_AUDIOS_POR_ANALISE; i++) {
      expect(r.porMensagem.get(`a-${i}`)).toBe(`T:p${i}`);
    }
    expect(r.tokens).toBe(MAX_AUDIOS_POR_ANALISE);
  });

  it("paralelismo: máximo simultâneo ≤ 3", async () => {
    let emVoo = 0;
    let maxSimultaneo = 0;
    const deps = makeDeps({
      transcrever: vi.fn(async () => {
        emVoo++;
        maxSimultaneo = Math.max(maxSimultaneo, emVoo);
        await new Promise((r) => setTimeout(r, 5));
        emVoo--;
        return { texto: "t", tokens: 1 };
      }),
    });
    const audios = Array.from({ length: 6 }, (_, i) =>
      makeAudio({ id: `a-${i}`, midia_url: `p${i}`, created_at: `2026-07-01T10:0${i}:00Z` }),
    );
    const r = await transcreverPendentes(audios, deps);
    expect(maxSimultaneo).toBeLessThanOrEqual(TRANSCRICAO_PARALELISMO);
    expect(r.porMensagem.size).toBe(6);
    expect(r.tokens).toBe(6);
  });

  it("baixarAudio retornando null → placeholder (sem transcrever nem cache)", async () => {
    const deps = makeDeps({ baixarAudio: vi.fn(async () => null) });
    const r = await transcreverPendentes([makeAudio()], deps);
    expect(r.porMensagem.get("a-1")).toBe(PLACEHOLDER_SEM_TRANSCRICAO);
    expect(deps.transcrever).not.toHaveBeenCalled();
    expect(deps.salvarCache).not.toHaveBeenCalled();
  });

  it("midia_url null → placeholder sem baixar", async () => {
    const deps = makeDeps();
    const r = await transcreverPendentes([makeAudio({ midia_url: null })], deps);
    expect(r.porMensagem.get("a-1")).toBe(PLACEHOLDER_SEM_TRANSCRICAO);
    expect(deps.baixarAudio).not.toHaveBeenCalled();
  });
});
