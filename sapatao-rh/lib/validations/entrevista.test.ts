import { describe, it, expect } from "vitest";
import { entrevistaSchema } from "./entrevista";

const base = {
  data_hora: "2026-07-01T10:00",
  formato: "presencial" as const,
  local_ou_link: null,
  observacoes: null,
};

describe("entrevistaSchema", () => {
  it("aceita entrada mínima válida", () => {
    expect(entrevistaSchema.safeParse(base).success).toBe(true);
  });

  it("aceita online com link", () => {
    const r = entrevistaSchema.safeParse({ ...base, formato: "online", local_ou_link: "https://meet.google.com/abc" });
    expect(r.success).toBe(true);
  });

  it("rejeita data_hora vazia", () => {
    const r = entrevistaSchema.safeParse({ ...base, data_hora: "" });
    expect(r.success).toBe(false);
  });

  it("rejeita formato inválido", () => {
    const r = entrevistaSchema.safeParse({ ...base, formato: "telefone" });
    expect(r.success).toBe(false);
  });

  it("rejeita local_ou_link maior que 255 chars", () => {
    const r = entrevistaSchema.safeParse({ ...base, local_ou_link: "x".repeat(256) });
    expect(r.success).toBe(false);
  });

  it("rejeita observacoes maior que 1000 chars", () => {
    const r = entrevistaSchema.safeParse({ ...base, observacoes: "x".repeat(1001) });
    expect(r.success).toBe(false);
  });

  it("aceita observacoes nula (optional)", () => {
    const r = entrevistaSchema.safeParse({ ...base, observacoes: null });
    expect(r.success).toBe(true);
  });

  it("aceita com data_hora ISO completo", () => {
    const r = entrevistaSchema.safeParse({ ...base, data_hora: "2026-07-15T14:30:00.000Z" });
    expect(r.success).toBe(true);
  });
});
