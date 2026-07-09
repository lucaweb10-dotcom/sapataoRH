import { describe, it, expect } from "vitest";
import { credenciaisUazapiSchema, webhookPublicoSchema } from "./whatsapp";

describe("credenciaisUazapiSchema", () => {
  it("aceita URL https + token e normaliza espaços", () => {
    const r = credenciaisUazapiSchema.safeParse({
      baseUrl: " https://minha.uazapi.com/ ", adminToken: " tok-12345678 ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.baseUrl).toBe("https://minha.uazapi.com");
      expect(r.data.adminToken).toBe("tok-12345678");
    }
  });
  it("aceita adminToken null (manter o já salvo)", () => {
    const r = credenciaisUazapiSchema.safeParse({ baseUrl: "https://x.uazapi.com", adminToken: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adminToken).toBeNull();
  });
  it("rejeita URL inválida e token curto", () => {
    expect(credenciaisUazapiSchema.safeParse({ baseUrl: "nao-e-url", adminToken: "tok-12345678" }).success).toBe(false);
    expect(credenciaisUazapiSchema.safeParse({ baseUrl: "https://x.uazapi.com", adminToken: "curto" }).success).toBe(false);
  });
});

describe("webhookPublicoSchema", () => {
  it("aceita URL do túnel e remove barra final", () => {
    const r = webhookPublicoSchema.safeParse({ url: "https://abc.trycloudflare.com/" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.url).toBe("https://abc.trycloudflare.com");
  });
  it("rejeita não-URL", () => {
    expect(webhookPublicoSchema.safeParse({ url: "localhost sem esquema" }).success).toBe(false);
  });
});
