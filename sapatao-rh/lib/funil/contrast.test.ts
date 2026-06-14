import { describe, it, expect } from "vitest";
import { contrastText } from "./contrast";

describe("contrastText", () => {
  it("uses white text on dark/mid stage colors", () => {
    expect(contrastText("#4A7C59")).toBe("#ffffff"); // Novo Lead / Triagem (verde)
    expect(contrastText("#E85D2F")).toBe("#ffffff"); // Currículo Recebido (laranja)
    expect(contrastText("#1E4D2B")).toBe("#ffffff"); // Aprovado / Contratado (verde escuro)
  });

  it("uses dark text on light stage colors", () => {
    expect(contrastText("#FFD500")).toBe("#20251f"); // Apto p/ Entrevista (amarelo)
    expect(contrastText("#9CA3AF")).toBe("#20251f"); // Reprovado / Desistente (cinza)
  });

  it("tolerates a missing # prefix", () => {
    expect(contrastText("4A7C59")).toBe("#ffffff");
  });

  it("falls back to dark text on malformed input", () => {
    expect(contrastText("nope")).toBe("#20251f");
    expect(contrastText("")).toBe("#20251f");
    expect(contrastText("#fff")).toBe("#20251f");
  });
});
