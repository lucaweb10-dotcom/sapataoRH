import { describe, it, expect } from "vitest";
import { aplicarReordenacao } from "./reordenar";

describe("aplicarReordenacao", () => {
  it("move um id para um novo índice preservando o resto", () => {
    expect(aplicarReordenacao(["a", "b", "c", "d"], "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(aplicarReordenacao(["a", "b", "c", "d"], "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(aplicarReordenacao(["a", "b", "c", "d"], "b", 2)).toEqual(["a", "c", "b", "d"]);
  });
  it("id inexistente -> inalterado (cópia)", () => {
    const orig = ["a", "b"];
    const out = aplicarReordenacao(orig, "x", 0);
    expect(out).toEqual(["a", "b"]);
    expect(out).not.toBe(orig);
  });
  it("clampa o índice acima do tamanho", () => {
    expect(aplicarReordenacao(["a", "b", "c"], "a", 99)).toEqual(["b", "c", "a"]);
  });
  it("clampa índice negativo para 0", () => {
    expect(aplicarReordenacao(["a", "b", "c"], "c", -5)).toEqual(["c", "a", "b"]);
  });
});
