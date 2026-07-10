import { describe, it, expect } from "vitest";
import { limiteExcedido } from "./limite";

describe("limiteExcedido", () => {
  it("limite null = sem limite (nunca excede)", () => {
    expect(limiteExcedido(0, null)).toBe(false);
    expect(limiteExcedido(999_999, null)).toBe(false);
  });

  it("abaixo do limite → false", () => {
    expect(limiteExcedido(499, 500)).toBe(false);
  });

  it("igual ao limite → true (>=)", () => {
    expect(limiteExcedido(500, 500)).toBe(true);
  });

  it("acima do limite → true", () => {
    expect(limiteExcedido(501, 500)).toBe(true);
  });
});
