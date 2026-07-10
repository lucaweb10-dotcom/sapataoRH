import { describe, it, expect } from "vitest";
import { templateSchema } from "./template";

describe("templateSchema", () => {
  it("aceita template válido e normaliza categoria para minúsculas", () => {
    const r = templateSchema.safeParse({
      nome: "Saudação padrão",
      categoria: " Saudacao ",
      conteudo: "Olá {{nome}}!",
      ativo: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoria).toBe("saudacao");
  });

  it("rejeita categoria com espaço ou caracteres inválidos", () => {
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "follow up", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "olá!", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
  });

  it("rejeita nome e conteúdo vazios", () => {
    expect(
      templateSchema.safeParse({ nome: "", categoria: "outro", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "outro", conteudo: "  ", ativo: true })
        .success,
    ).toBe(false);
  });

  it("aceita ativo=false", () => {
    const r = templateSchema.safeParse({
      nome: "X",
      categoria: "outro",
      conteudo: "oi",
      ativo: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(false);
  });
});
