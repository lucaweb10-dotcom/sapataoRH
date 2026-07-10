import { describe, it, expect } from "vitest";
import { parseFunilFiltros } from "./filtros";

const UUID = "0b8e6f0a-1111-4222-8333-444455556666";

describe("parseFunilFiltros", () => {
  it("defaults: tudo vazio/nulo", () => {
    expect(parseFunilFiltros({})).toEqual({ q: "", vaga: null, resp: null, unidadeId: null });
  });

  it("apara e limita a busca a 80 chars", () => {
    const grande = "a".repeat(100);
    const r = parseFunilFiltros({ q: `  ${grande}  ` });
    expect(r.q).toHaveLength(80);
  });

  it("vaga é texto livre; array (param repetido) é ignorado", () => {
    expect(parseFunilFiltros({ vaga: " Atendente " }).vaga).toBe("Atendente");
    expect(parseFunilFiltros({ vaga: ["a", "b"] }).vaga).toBeNull();
  });

  it("resp aceita 'me' e uuid; rejeita lixo", () => {
    expect(parseFunilFiltros({ resp: "me" }).resp).toBe("me");
    expect(parseFunilFiltros({ resp: UUID }).resp).toBe(UUID);
    expect(parseFunilFiltros({ resp: "drop table" }).resp).toBeNull();
  });

  it("u só aceita uuid", () => {
    expect(parseFunilFiltros({ u: UUID }).unidadeId).toBe(UUID);
    expect(parseFunilFiltros({ u: "todas" }).unidadeId).toBeNull();
  });
});
