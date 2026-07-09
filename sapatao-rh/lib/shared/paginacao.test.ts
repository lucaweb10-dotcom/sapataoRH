import { describe, it, expect } from "vitest";
import { rangeDaPagina, totalPaginas, resumoPaginacao } from "./paginacao";

describe("rangeDaPagina", () => {
  it("computes inclusive ranges (30 por página)", () => {
    expect(rangeDaPagina(1)).toEqual({ from: 0, to: 29 });
    expect(rangeDaPagina(2)).toEqual({ from: 30, to: 59 });
  });

  it("clamps invalid pages to 1", () => {
    expect(rangeDaPagina(0)).toEqual({ from: 0, to: 29 });
    expect(rangeDaPagina(-3)).toEqual({ from: 0, to: 29 });
  });
});

describe("totalPaginas", () => {
  it("rounds up and never returns 0", () => {
    expect(totalPaginas(0)).toBe(1);
    expect(totalPaginas(30)).toBe(1);
    expect(totalPaginas(31)).toBe(2);
    expect(totalPaginas(132)).toBe(5);
  });
});

describe("resumoPaginacao", () => {
  it("describes the visible slice", () => {
    expect(resumoPaginacao(1, 132)).toBe("1–30 de 132");
    expect(resumoPaginacao(2, 132)).toBe("31–60 de 132");
    expect(resumoPaginacao(5, 132)).toBe("121–132 de 132");
  });

  it("handles empty and tiny results", () => {
    expect(resumoPaginacao(1, 0)).toBe("0 de 0");
    expect(resumoPaginacao(1, 3)).toBe("1–3 de 3");
  });
});
