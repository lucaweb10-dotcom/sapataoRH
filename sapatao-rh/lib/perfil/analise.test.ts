import { describe, it, expect, vi } from "vitest";
import { analisarPerfil, type PerfilDeps, type PerfilInput, type PerfilMensagem } from "./analise";
import { LlmError } from "@/lib/llm/types";
import { PARECER_JSON_SCHEMA } from "@/lib/cv/parecer";

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

const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

const input: PerfilInput = {
  empresaId: "emp-1",
  candidatoId: "c-1",
  conversationId: "conv-1",
  candidato: {
    nome: "Maria",
    telefone: "5511999990000",
    vaga_interesse: "Frentista",
    idade: 25,
    cep: null,
    endereco: null,
    tem_veiculo: null,
    tags: [],
    notas_internas: null,
  },
  cargo: null,
  movidoPor: "u-1",
};

function makeMsg(over: Partial<PerfilMensagem> = {}): PerfilMensagem {
  return {
    id: "m-1",
    direction: "inbound",
    tipo: "text",
    conteudo: "olá, quero a vaga",
    midia_mime: null,
    midia_url: null,
    metadata: {},
    created_at: "2026-07-01T10:00:00Z",
    transcricao: null,
    ...over,
  };
}

function makeDeps(over: Partial<PerfilDeps> = {}): PerfilDeps {
  return {
    getMensagens: vi.fn(async () => [makeMsg()]),
    checarLimite: vi.fn(async () => ({ excedido: false })),
    transcreverPendentes: vi.fn(async () => ({ porMensagem: new Map<string, string>(), tokens: 0 })),
    getDocumentoTexto: vi.fn(async () => null),
    getAnexoPdf: vi.fn(async () => null),
    getAnexoImagem: vi.fn(async () => null),
    getCriterios: vi.fn(async () => ({ prompt_base: "b", criterios: ["x"], gerais: null, modelo: "mock" })),
    llmJson: vi.fn(async () => ({ json: JSON.stringify(validParecer), tokensEst: 100 })),
    persist: vi.fn(async () => ({ error: null })),
    registrarAnalise: vi.fn(async () => ({ error: null })),
    moverParaAnaliseConcluida: vi.fn(async () => true),
    ...over,
  };
}

describe("analisarPerfil", () => {
  it("sucesso: persiste, loga ok com tokens LLM+transcrição e move (movido=true)", async () => {
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [
        makeMsg(),
        makeMsg({ id: "m-2", tipo: "audio", conteudo: null, midia_url: "a-path" }),
      ]),
      transcreverPendentes: vi.fn(async () => ({ porMensagem: new Map([["m-2", "oi"]]), tokens: 7 })),
    });
    const r = await analisarPerfil(input, deps);
    expect(r).toEqual({ ok: true, score: 72, parecer: expect.objectContaining({ score: 72 }), movido: true });
    expect(deps.persist).toHaveBeenCalledWith("c-1", 72, expect.objectContaining({ score: 72 }));
    expect(deps.moverParaAnaliseConcluida).toHaveBeenCalledWith("c-1");
    expect(deps.registrarAnalise).toHaveBeenCalledWith(
      expect.objectContaining({ status: "ok", score: 72, tokensEst: 107 }),
    );
    // só os áudios com midia_url vão para a transcrição
    expect(deps.transcreverPendentes).toHaveBeenCalledWith([
      { id: "m-2", midia_url: "a-path", transcricao: null, created_at: "2026-07-01T10:00:00Z" },
    ]);
    // schema estrito repassado ao LLM
    expect(deps.llmJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ jsonSchema: PARECER_JSON_SCHEMA }),
    );
  });

  it("movido=false quando mover retorna false", async () => {
    const deps = makeDeps({ moverParaAnaliseConcluida: vi.fn(async () => false) });
    const r = await analisarPerfil(input, deps);
    expect(r).toMatchObject({ ok: true, movido: false });
  });

  it("sem mensagens → sem_mensagens (LLM não chamado)", async () => {
    const deps = makeDeps({ getMensagens: vi.fn(async () => []) });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "sem_mensagens" });
    expect(deps.llmJson).not.toHaveBeenCalled();
    expect(deps.registrarAnalise).toHaveBeenCalledWith(expect.objectContaining({ status: "sem_mensagens" }));
  });

  it("só mensagens system → sem_mensagens", async () => {
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [makeMsg({ tipo: "system", conteudo: "movido de etapa" })]),
    });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "sem_mensagens" });
    expect(deps.llmJson).not.toHaveBeenCalled();
  });

  it("limite excedido → limite_excedido ANTES de transcrever", async () => {
    const deps = makeDeps({ checarLimite: vi.fn(async () => ({ excedido: true })) });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "limite_excedido" });
    expect(deps.transcreverPendentes).not.toHaveBeenCalled();
    expect(deps.llmJson).not.toHaveBeenCalled();
  });

  it("transcreverPendentes rejeita com chave_invalida → chave_invalida", async () => {
    const deps = makeDeps({
      transcreverPendentes: vi.fn(async () => {
        throw new LlmError("chave_invalida");
      }),
    });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "chave_invalida" });
    expect(deps.llmJson).not.toHaveBeenCalled();
    expect(deps.registrarAnalise).toHaveBeenCalledWith(expect.objectContaining({ status: "chave_invalida" }));
  });

  it("llmJson rejeita LlmError chave_invalida → chave_invalida", async () => {
    const deps = makeDeps({
      llmJson: vi.fn(async () => {
        throw new LlmError("chave_invalida");
      }),
    });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "chave_invalida" });
  });

  it("llmJson rejeita Error comum → ia_indisponivel", async () => {
    const deps = makeDeps({
      llmJson: vi.fn(async () => {
        throw new Error("timeout");
      }),
    });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "ia_indisponivel" });
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("JSON inválido → parecer_invalido (não persiste, loga com tokens)", async () => {
    const deps = makeDeps({ llmJson: vi.fn(async () => ({ json: "{quebrado", tokensEst: 5 })) });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "parecer_invalido" });
    expect(deps.persist).not.toHaveBeenCalled();
    expect(deps.registrarAnalise).toHaveBeenCalledWith(
      expect.objectContaining({ status: "parecer_invalido", tokensEst: 5 }),
    );
  });

  it("persist {error} → persist_falhou (não move)", async () => {
    const deps = makeDeps({ persist: vi.fn(async () => ({ error: { message: "boom" } })) });
    expect(await analisarPerfil(input, deps)).toEqual({ ok: false, error: "persist_falhou" });
    expect(deps.moverParaAnaliseConcluida).not.toHaveBeenCalled();
    expect(deps.registrarAnalise).toHaveBeenCalledWith(expect.objectContaining({ status: "persist_falhou" }));
  });

  it("mover que LANÇA é best-effort → resultado ok com movido=false", async () => {
    const deps = makeDeps({
      moverParaAnaliseConcluida: vi.fn(async () => {
        throw new Error("move fail");
      }),
    });
    const r = await analisarPerfil(input, deps);
    expect(r).toMatchObject({ ok: true, movido: false });
  });

  it("anexo PDF: getAnexoPdf chamado e anexo repassado em opts.anexos", async () => {
    const anexoPdf = { kind: "pdf" as const, mime: "application/pdf", base64: "UERG", nome: "cv.pdf" };
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [
        makeMsg(),
        makeMsg({
          id: "m-2",
          tipo: "document",
          conteudo: null,
          midia_mime: "application/pdf",
          midia_url: "docs/cv.pdf",
          metadata: { fileName: "cv.pdf" },
        }),
      ]),
      getAnexoPdf: vi.fn(async () => anexoPdf),
    });
    const r = await analisarPerfil(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.getAnexoPdf).toHaveBeenCalledWith("docs/cv.pdf", "cv.pdf");
    const opts = vi.mocked(deps.llmJson).mock.calls[0][2];
    expect(opts.anexos).toContainEqual(anexoPdf);
  });

  it("imagem inbound → getAnexoImagem chamado com path e mime", async () => {
    const anexoImg = { kind: "image" as const, mime: "image/jpeg", base64: "SU1H" };
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [
        makeMsg(),
        makeMsg({
          id: "m-2",
          tipo: "image",
          conteudo: null,
          midia_mime: "image/jpeg",
          midia_url: "imgs/rg.jpg",
        }),
      ]),
      getAnexoImagem: vi.fn(async () => anexoImg),
    });
    await analisarPerfil(input, deps);
    expect(deps.getAnexoImagem).toHaveBeenCalledWith("imgs/rg.jpg", "image/jpeg");
    const opts = vi.mocked(deps.llmJson).mock.calls[0][2];
    expect(opts.anexos).toContainEqual(anexoImg);
  });

  it("imagem outbound NÃO vira anexo", async () => {
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [
        makeMsg(),
        makeMsg({
          id: "m-2",
          tipo: "image",
          direction: "outbound",
          conteudo: null,
          midia_mime: "image/jpeg",
          midia_url: "imgs/logo.jpg",
        }),
      ]),
    });
    await analisarPerfil(input, deps);
    expect(deps.getAnexoImagem).not.toHaveBeenCalled();
  });

  it("DOCX → getDocumentoTexto e texto entra no user do LLM", async () => {
    const deps = makeDeps({
      getMensagens: vi.fn(async () => [
        makeMsg(),
        makeMsg({
          id: "m-2",
          tipo: "document",
          conteudo: null,
          midia_mime: DOCX_MIME,
          midia_url: "docs/cv.docx",
          metadata: { fileName: "cv.docx" },
        }),
      ]),
      getDocumentoTexto: vi.fn(async () => "TEXTO EXTRAIDO DO DOCX"),
    });
    await analisarPerfil(input, deps);
    expect(deps.getDocumentoTexto).toHaveBeenCalledWith("docs/cv.docx", DOCX_MIME);
    const user = vi.mocked(deps.llmJson).mock.calls[0][1];
    expect(user).toContain("TEXTO EXTRAIDO DO DOCX");
    expect(user).toContain("cv.docx");
  });
});
