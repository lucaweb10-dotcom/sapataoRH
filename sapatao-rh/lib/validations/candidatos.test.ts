import { describe, it, expect } from "vitest";
import { criarCandidatoSchema, atualizarCandidatoSchema } from "./candidatos";

describe("criarCandidatoSchema", () => {
  it("normaliza telefone para só dígitos", () => {
    const r = criarCandidatoSchema.safeParse({
      nome: "Ana Souza",
      telefone: "(51) 99900-0001",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefone).toBe("51999000001");
  });

  it("aplica defaults: origem outro, tags [], vaga/unidade null", () => {
    const r = criarCandidatoSchema.safeParse({ nome: "Ana Souza", telefone: "5199900000" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.origem).toBe("outro");
      expect(r.data.tags).toEqual([]);
      expect(r.data.vaga_interesse).toBeNull();
      expect(r.data.unidade_id).toBeNull();
    }
  });

  it("rejeita telefone curto (<10 dígitos) e longo (>15)", () => {
    expect(criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "519990" }).success).toBe(false);
    expect(
      criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "1234567890123456" }).success,
    ).toBe(false);
  });

  it("rejeita nome de 1 caractere e origem desconhecida", () => {
    expect(criarCandidatoSchema.safeParse({ nome: "A", telefone: "5199900000" }).success).toBe(false);
    expect(
      criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "5199900000", origem: "tiktok" }).success,
    ).toBe(false);
  });
});

describe("atualizarCandidatoSchema", () => {
  it("aceita patch parcial", () => {
    const r = atualizarCandidatoSchema.safeParse({ idade: 25 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ idade: 25 });
  });

  it("rejeita patch vazio", () => {
    expect(atualizarCandidatoSchema.safeParse({}).success).toBe(false);
  });

  it("atribuido_a: aceita uuid e null, rejeita string qualquer", () => {
    expect(
      atualizarCandidatoSchema.safeParse({ atribuido_a: "0b8e6f0a-1111-4222-8333-444455556666" }).success,
    ).toBe(true);
    expect(atualizarCandidatoSchema.safeParse({ atribuido_a: null }).success).toBe(true);
    expect(atualizarCandidatoSchema.safeParse({ atribuido_a: "eu" }).success).toBe(false);
  });

  it("rejeita idade fora de 14-99 e normaliza telefone", () => {
    expect(atualizarCandidatoSchema.safeParse({ idade: 200 }).success).toBe(false);
    const r = atualizarCandidatoSchema.safeParse({ telefone: "51 99900-0002" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefone).toBe("51999000002");
  });
});
