import { describe, it, expect } from "vitest";
import { rangeDaPagina, totalPaginas, resumoPaginacao } from "./paginacao";

describe("rangeDaPagina", () => {
  it("computes inclusive ranges (25 por página)", () => {
    expect(rangeDaPagina(1)).toEqual({ from: 0, to: 24 });
    expect(rangeDaPagina(2)).toEqual({ from: 25, to: 49 });
  });

  it("clamps invalid pages to 1", () => {
    expect(rangeDaPagina(0)).toEqual({ from: 0, to: 24 });
    expect(rangeDaPagina(-3)).toEqual({ from: 0, to: 24 });
  });
});

describe("totalPaginas", () => {
  it("rounds up and never returns 0", () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(25)).toBe(1);
    expect(totalPaginas(26)).toBe(2);
    expect(totalPaginas(132)).toBe(6);
  });
});

describe("resumoPaginacao", () => {
  it("describes the visible slice", () => {
    expect(resumoPaginacao(1, 132)).toBe("1–25 de 132");
    expect(resumoPaginacao(2, 132)).toBe("26–50 de 132");
    expect(resumoPaginacao(6, 132)).toBe("126–132 de 132");
  });

  it("handles empty and tiny results", () => {
    expect(resumoPaginacao(1, 0)).toBe("0 de 0");
    expect(resumoPaginacao(1, 3)).toBe("1–3 de 3");
  });
});
