import { describe, it, expect } from "vitest";
import {
  aplicarEstilo,
  estiloOk,
  sanitizarEstilo,
  violacoesDe,
  instrucaoCorrecao,
  MAX_MENSAGEM_CHARS,
} from "./estilo";

describe("violacoesDe", () => {
  it("aceita a mensagem humana curta", () => {
    expect(violacoesDe("oi! você tá procurando vaga com a gente?")).toEqual([]);
    expect(estiloOk("legal, qual função te interessa?")).toBe(true);
  });

  it("pega travessão e meia-risca", () => {
    expect(violacoesDe("oi — tudo bem?")).toContain("travessao");
    expect(violacoesDe("oi – tudo bem?")).toContain("travessao");
  });

  it("pega markdown", () => {
    expect(violacoesDe("**oi**, tudo bem?")).toContain("markdown");
    expect(violacoesDe("- primeiro item")).toContain("markdown");
    expect(violacoesDe("# título")).toContain("markdown");
  });

  it("pega linguagem corporativa em qualquer caixa", () => {
    expect(violacoesDe("Prezado candidato, tudo bem?")).toContain("corporativo");
    expect(violacoesDe("Estamos à disposição.")).toContain("corporativo");
    expect(violacoesDe("ATENCIOSAMENTE, RH")).toContain("corporativo");
  });

  it("pega mensagem longa", () => {
    expect(violacoesDe("a".repeat(MAX_MENSAGEM_CHARS + 1))).toContain("longa");
    expect(violacoesDe("a".repeat(MAX_MENSAGEM_CHARS))).not.toContain("longa");
  });

  it("pega mais de uma pergunta na mesma mensagem", () => {
    expect(violacoesDe("qual sua idade? e você tem veículo?")).toContain("multiplas_perguntas");
    expect(violacoesDe("qual sua idade?")).not.toContain("multiplas_perguntas");
  });

  it("trata string em branco como vazia e não acumula outras violações", () => {
    expect(violacoesDe("   ")).toEqual(["vazia"]);
  });
});

describe("sanitizarEstilo", () => {
  it("troca travessão por vírgula sem duplicar pontuação", () => {
    expect(sanitizarEstilo("oi — tudo bem")).toBe("oi, tudo bem");
    expect(sanitizarEstilo("oi, — tudo bem")).toBe("oi, tudo bem");
  });

  it("remove marcação de markdown", () => {
    expect(sanitizarEstilo("**oi** tudo bem")).toBe("oi tudo bem");
    expect(sanitizarEstilo("- item um")).toBe("item um");
  });
});

describe("aplicarEstilo", () => {
  it("passa direto quando já está no padrão", () => {
    const r = aplicarEstilo("oi, qual função te interessa?");
    expect(r).toEqual({ ok: true, texto: "oi, qual função te interessa?", sanitizada: false });
  });

  it("conserta travessão e marca que sanitizou", () => {
    const r = aplicarEstilo("oi — qual função te interessa?");
    expect(r).toEqual({ ok: true, texto: "oi, qual função te interessa?", sanitizada: true });
  });

  it("reprova o que não dá para consertar mecanicamente", () => {
    const r = aplicarEstilo("Prezado candidato, qual sua idade? e seu endereço?");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.violacoes).toContain("corporativo");
      expect(r.violacoes).toContain("multiplas_perguntas");
    }
  });

  it("mensagem sanitizada nunca sai com travessão", () => {
    const r = aplicarEstilo("beleza — te retorno em breve");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.texto).not.toMatch(/[—–]/);
  });
});

describe("instrucaoCorrecao", () => {
  it("descreve cada violação para o retry", () => {
    const texto = instrucaoCorrecao(["travessao", "longa"]);
    expect(texto).toContain("travessão");
    expect(texto).toContain(String(MAX_MENSAGEM_CHARS));
  });
});
