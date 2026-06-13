import { describe, it, expect } from "vitest";
import { loginSchema, createUsuarioSchema } from "./usuarios";

describe("loginSchema", () => {
  it("accepts a valid email + password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "secret1" }).success).toBe(true);
  });
  it("rejects a bad email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "secret1" }).success).toBe(false);
  });
});

describe("createUsuarioSchema", () => {
  const ok = {
    nome: "Maria RH",
    email: "maria@sapatao.com",
    senha: "trocar123",
    role: "rh",
    unidades_acesso: ["11111111-1111-4111-8111-111111111111"],
  };
  it("accepts a valid payload", () => {
    expect(createUsuarioSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects password shorter than 6", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, senha: "123" }).success).toBe(false);
  });
  it("rejects an invalid role", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, role: "root" }).success).toBe(false);
  });
  it("rejects a non-uuid unidade", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, unidades_acesso: ["not-a-uuid"] }).success).toBe(false);
  });
});
