import { describe, it, expect } from "vitest";
import { parseFiltros, buscaOr } from "./filtros";

const UNIDADE = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseFiltros (funcionarios)", () => {
  it("defaults to status ativo on empty params", () => {
    expect(parseFiltros({})).toEqual({ q: "", status: "ativo", unidadeId: null, page: 1 });
  });

  it("status=todos means no status filter", () => {
    expect(parseFiltros({ status: "todos" }).status).toBeNull();
  });

  it("keeps valid values", () => {
    expect(parseFiltros({ q: " ana ", status: "afastado", unidade: UNIDADE, p: "2" })).toEqual({
      q: "ana",
      status: "afastado",
      unidadeId: UNIDADE,
      page: 2,
    });
  });

  it("falls back to ativo on unknown status and rejects bad unidade/page", () => {
    const f = parseFiltros({ status: "demitido", unidade: "x", p: "0" });
    expect(f.status).toBe("ativo");
    expect(f.unidadeId).toBeNull();
    expect(f.page).toBe(1);
  });
});

describe("buscaOr (funcionarios)", () => {
  it("matches nome e cargo for text", () => {
    expect(buscaOr("frentista")).toBe(
      "nome_completo.ilike.*frentista*,cargo.ilike.*frentista*",
    );
  });

  it("adds cpf match when query has 3+ digits", () => {
    expect(buscaOr("529")).toBe(
      "nome_completo.ilike.*529*,cargo.ilike.*529*,cpf.ilike.*529*",
    );
  });

  it("cpf-only for masked cpf input", () => {
    expect(buscaOr("529.982.247-25")).toContain("cpf.ilike.*52998224725*");
  });

  it("returns null for empty input", () => {
    expect(buscaOr("  ")).toBeNull();
  });
});
