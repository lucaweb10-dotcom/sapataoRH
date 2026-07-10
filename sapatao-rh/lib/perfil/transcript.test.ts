import { describe, it, expect } from "vitest";
import { montarTranscript, MAX_TRANSCRIPT_CHARS, type TranscriptMsg } from "./transcript";

function makeMsg(over: Partial<TranscriptMsg> = {}): TranscriptMsg {
  return {
    id: "m-1",
    direction: "inbound",
    tipo: "text",
    conteudo: "olá",
    midia_mime: null,
    metadata: {},
    created_at: "2026-07-01T10:00:00Z",
    transcricao: null,
    ...over,
  };
}

describe("montarTranscript", () => {
  it("rotula Candidato (inbound), RH (outbound) e Sistema (tipo system)", () => {
    const t = montarTranscript([
      makeMsg({ id: "1", direction: "inbound", conteudo: "oi, quero a vaga" }),
      makeMsg({ id: "2", direction: "outbound", conteudo: "olá! me conta mais" }),
      makeMsg({ id: "3", tipo: "system", direction: "outbound", conteudo: "etapa alterada" }),
    ]);
    expect(t).toContain("Candidato: oi, quero a vaga");
    expect(t).toContain("RH: olá! me conta mais");
    expect(t).toContain("Sistema: etapa alterada");
  });

  it("text usa o conteudo", () => {
    expect(montarTranscript([makeMsg({ conteudo: "mensagem de texto" })])).toContain("mensagem de texto");
  });

  it("image com caption → '[imagem: caption]'; sem caption → '[imagem]'", () => {
    const comCaption = montarTranscript([makeMsg({ tipo: "image", conteudo: "foto do RG" })]);
    expect(comCaption).toContain("[imagem: foto do RG]");
    const semCaption = montarTranscript([makeMsg({ tipo: "image", conteudo: null })]);
    expect(semCaption).toContain("[imagem]");
    expect(semCaption).not.toContain("[imagem:");
  });

  it("audio com transcrição → '[áudio]: texto'; sem → placeholder", () => {
    const com = montarTranscript([makeMsg({ tipo: "audio", conteudo: null, transcricao: "bom dia, tudo bem" })]);
    expect(com).toContain("[áudio]: bom dia, tudo bem");
    const sem = montarTranscript([makeMsg({ tipo: "ptt", conteudo: null, transcricao: null })]);
    expect(sem).toContain("[áudio sem transcrição]");
  });

  it("document com metadata.fileName → nome no marcador", () => {
    const t = montarTranscript([
      makeMsg({ tipo: "document", conteudo: null, metadata: { fileName: "curriculo.pdf" } }),
    ]);
    expect(t).toContain("curriculo.pdf");
    expect(t).toContain("[documento anexado:");
  });

  it("document sem fileName cai no mime", () => {
    const t = montarTranscript([
      makeMsg({ tipo: "document", conteudo: null, metadata: {}, midia_mime: "application/pdf" }),
    ]);
    expect(t).toContain("[documento anexado: application/pdf");
  });

  it("video e sticker viram marcadores", () => {
    const t = montarTranscript([
      makeMsg({ id: "1", tipo: "video", conteudo: null }),
      makeMsg({ id: "2", tipo: "sticker", conteudo: null }),
    ]);
    expect(t).toContain("[vídeo]");
    expect(t).toContain("[figurinha]");
  });

  it("mensagens de corpo vazio são omitidas", () => {
    expect(montarTranscript([makeMsg({ conteudo: "   " })])).toBe("");
    const t = montarTranscript([
      makeMsg({ id: "1", conteudo: "" }),
      makeMsg({ id: "2", conteudo: "única linha" }),
    ]);
    expect(t.split("\n")).toHaveLength(1);
    expect(t).toContain("única linha");
  });

  it("truncamento: preserva início + final com marcador de omissão e respeita o cap", () => {
    const msgs: TranscriptMsg[] = Array.from({ length: 40 }, (_, i) => {
      let corpo = `msg-${i} ` + "A".repeat(1000);
      if (i === 0) corpo = "MARCA_INICIO " + corpo;
      if (i === 10) corpo = "MARCA_MEIO " + corpo;
      if (i === 39) corpo = corpo + " MARCA_FIM";
      return makeMsg({ id: `m-${i}`, conteudo: corpo });
    });
    const bruto = msgs.map((m) => m.conteudo).join("\n");
    expect(bruto.length).toBeGreaterThan(30_000); // garante que estoura o cap

    const t = montarTranscript(msgs);
    expect(t).toContain("MARCA_INICIO");
    expect(t).toContain("…[trecho intermediário omitido]…");
    expect(t).toContain("MARCA_FIM");
    expect(t).not.toContain("MARCA_MEIO");
    expect(t.length).toBeLessThanOrEqual(MAX_TRANSCRIPT_CHARS + 50);
  });

  it("abaixo do cap não trunca nem insere marcador", () => {
    const t = montarTranscript([makeMsg({ conteudo: "curta" })]);
    expect(t).not.toContain("omitido");
  });
});
