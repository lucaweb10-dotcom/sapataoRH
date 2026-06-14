import { describe, it, expect } from "vitest";
import { etapaSchema } from "./etapa";

const base = {
  nome: "Triagem",
  cor: "#4A7C59",
  sla_dias: null,
  is_terminal: false,
  requires_confirm: false,
  status_destino: null,
};

describe("etapaSchema", () => {
  it("aceita não-terminal sem status_destino", () => {
    expect(etapaSchema.safeParse(base).success).toBe(true);
  });
  it("aceita terminal com status_destino válido", () => {
    expect(
      etapaSchema.safeParse({ ...base, is_terminal: true, requires_confirm: true, status_destino: "reprovado" }).success,
    ).toBe(true);
  });
  it("rejeita terminal SEM status_destino", () => {
    expect(etapaSchema.safeParse({ ...base, is_terminal: true, status_destino: null }).success).toBe(false);
  });
  it("rejeita não-terminal COM status_destino", () => {
    expect(etapaSchema.safeParse({ ...base, is_terminal: false, status_destino: "contratado" }).success).toBe(false);
  });
  it("rejeita status_destino fora do enum", () => {
    expect(etapaSchema.safeParse({ ...base, is_terminal: true, status_destino: "aprovado" }).success).toBe(false);
  });
  it("rejeita cor não-hex e nome vazio", () => {
    expect(etapaSchema.safeParse({ ...base, cor: "verde" }).success).toBe(false);
    expect(etapaSchema.safeParse({ ...base, nome: "" }).success).toBe(false);
  });
});
