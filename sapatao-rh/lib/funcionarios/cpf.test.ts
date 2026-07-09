import { describe, it, expect } from "vitest";
import { cpfValido, formatarCpf, normalizarCpf } from "./cpf";

describe("cpfValido", () => {
  it("accepts valid CPFs with and without mask", () => {
    // CPFs válidos gerados pelo algoritmo oficial (fictícios)
    expect(cpfValido("529.982.247-25")).toBe(true);
    expect(cpfValido("52998224725")).toBe(true);
    expect(cpfValido("111.444.777-35")).toBe(true);
  });

  it("rejects wrong check digits", () => {
    expect(cpfValido("52998224724")).toBe(false);
    expect(cpfValido("111.444.777-36")).toBe(false);
  });

  it("rejects repeated-digit and malformed inputs", () => {
    expect(cpfValido("11111111111")).toBe(false);
    expect(cpfValido("00000000000")).toBe(false);
    expect(cpfValido("123")).toBe(false);
    expect(cpfValido("")).toBe(false);
    expect(cpfValido("abc.def.ghi-jk")).toBe(false);
  });
});

describe("normalizarCpf / formatarCpf", () => {
  it("strips mask and re-applies it", () => {
    expect(normalizarCpf("529.982.247-25")).toBe("52998224725");
    expect(formatarCpf("52998224725")).toBe("529.982.247-25");
  });

  it("degrades gracefully", () => {
    expect(formatarCpf(null)).toBe("");
    expect(formatarCpf("123")).toBe("123");
  });
});
