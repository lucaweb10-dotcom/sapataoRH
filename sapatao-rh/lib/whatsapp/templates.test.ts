import { describe, it, expect } from "vitest";
import { preencherTemplate, primeiroNome } from "./templates";

describe("primeiroNome", () => {
  it("extrai o primeiro nome", () => {
    expect(primeiroNome("Ana Paula Souza")).toBe("Ana");
    expect(primeiroNome("  Bruna  ")).toBe("Bruna");
  });
  it("vazio/null vira string vazia", () => {
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(null)).toBe("");
    expect(primeiroNome(undefined)).toBe("");
  });
});

describe("preencherTemplate", () => {
  it("substitui nome (primeiro), vaga e unidade", () => {
    const r = preencherTemplate(
      "Olá {{nome}}! Vi seu interesse na vaga {{vaga}} da unidade {{unidade}}.",
      { nome: "Ana Paula Souza", vaga: "Atendente", unidade: "Centro" },
    );
    expect(r).toBe("Olá Ana! Vi seu interesse na vaga Atendente da unidade Centro.");
  });

  it("tolera espaços dentro das chaves e maiúsculas", () => {
    const r = preencherTemplate("Oi {{ Nome }}, vaga {{ VAGA }}.", {
      nome: "Bia Costa",
      vaga: "Cozinha",
    });
    expect(r).toBe("Oi Bia, vaga Cozinha.");
  });

  it("variável sem valor é removida sem sobrar {{...}} nem espaço órfão", () => {
    const r = preencherTemplate("Olá {{nome}}, tudo bem? Sobre a vaga {{vaga}} !", {
      nome: null,
      vaga: null,
    });
    expect(r).not.toContain("{{");
    expect(r).toBe("Olá, tudo bem? Sobre a vaga!");
  });

  it("variável desconhecida também é removida", () => {
    const r = preencherTemplate("Oi {{nome}} {{sobrenome}}!", { nome: "Ana Souza" });
    expect(r).toBe("Oi Ana!");
  });

  it("mantém quebras de linha e limpa bordas de cada linha", () => {
    const r = preencherTemplate("Olá {{nome}}!\nVaga: {{vaga}}\nAté já.", { nome: "Ana" });
    expect(r).toBe("Olá Ana!\nVaga:\nAté já.");
  });

  it("remove placeholders malformados ({{123}}, {{}}, {{a b}})", () => {
    expect(preencherTemplate("Oi {{123}} tudo {{}} bem {{a b}}?", {})).toBe("Oi tudo bem?");
  });
});
