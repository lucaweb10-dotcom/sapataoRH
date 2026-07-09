import { describe, it, expect } from "vitest";
import { parseFiltros, buscaOr } from "./filtros";

const ETAPA = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("parseFiltros", () => {
  it("defaults on empty params", () => {
    expect(parseFiltros({})).toEqual({ q: "", status: null, etapaId: null, page: 1 });
  });

  it("keeps valid values", () => {
    expect(parseFiltros({ q: "  maria ", status: "contratado", etapa: ETAPA, p: "3" })).toEqual({
      q: "maria",
      status: "contratado",
      etapaId: ETAPA,
      page: 3,
    });
  });

  it("rejects unknown status, non-uuid etapa and bad pages", () => {
    const f = parseFiltros({ status: "hackeado", etapa: "abc", p: "-2" });
    expect(f.status).toBeNull();
    expect(f.etapaId).toBeNull();
    expect(f.page).toBe(1);
    expect(parseFiltros({ p: "banana" }).page).toBe(1);
  });

  it("ignores array params and truncates long queries", () => {
    expect(parseFiltros({ q: ["a", "b"] }).q).toBe("");
    expect(parseFiltros({ q: "x".repeat(200) }).q).toHaveLength(80);
  });
});

describe("buscaOr", () => {
  it("matches nome for text queries", () => {
    expect(buscaOr("maria")).toBe("nome.ilike.*maria*");
  });

  it("adds telefone match when the query has 4+ digits", () => {
    expect(buscaOr("5199")).toBe("nome.ilike.*5199*,telefone.ilike.*5199*");
  });

  it("extracts digits from formatted phones", () => {
    expect(buscaOr("(51) 99876-1234")).toBe("nome.ilike.*51 99876-1234*,telefone.ilike.*51998761234*");
  });

  it("strips or() breakers and escapes ilike wildcards", () => {
    expect(buscaOr("a,b(c)")).toBe("nome.ilike.*a b c*");
    expect(buscaOr("100%_ok")).toBe("nome.ilike.*100\\%\\_ok*");
  });

  it("returns null when nothing usable remains", () => {
    expect(buscaOr("")).toBeNull();
    expect(buscaOr("  ,() ")).toBeNull();
  });
});
