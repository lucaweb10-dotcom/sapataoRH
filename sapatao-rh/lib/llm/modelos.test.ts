import { describe, it, expect } from "vitest";
import { custoUsd } from "./modelos";

describe("custoUsd", () => {
  it("terra: 1M in + 1M out = 2.5 + 15 = 17.5", () => {
    expect(custoUsd("gpt-5.6-terra", 1_000_000, 1_000_000)).toBe(17.5);
  });

  it("modelo desconhecido usa o preço do Terra", () => {
    expect(custoUsd("modelo-que-nao-existe", 1_000_000, 1_000_000)).toBe(17.5);
  });

  it("luna: 100k in + 10k out = 0.1 + 0.06 = 0.16", () => {
    expect(custoUsd("gpt-5.6-luna", 100_000, 10_000)).toBeCloseTo(0.16, 10);
  });

  it("zero tokens → custo zero", () => {
    expect(custoUsd("gpt-5.6-terra", 0, 0)).toBe(0);
  });
});
