import { describe, it, expect } from "vitest";
import { resolveUazapiConfig } from "./config";

describe("resolveUazapiConfig", () => {
  it("prefere credenciais do banco sobre env", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com/", uazapi_admin_token: "tok-db" },
      { url: "https://env.uazapi.com", adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: "tok-db" });
  });

  it("cai para env quando banco vazio (e normaliza barra final)", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: null, uazapi_admin_token: null },
      { url: "https://env.uazapi.com/", adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://env.uazapi.com", adminToken: "tok-env" });
  });

  it("mistura: base do banco + admin token do env", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com", uazapi_admin_token: null },
      { url: undefined, adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: "tok-env" });
  });

  it("retorna null sem base URL em lugar nenhum", () => {
    expect(resolveUazapiConfig({ uazapi_base_url: null, uazapi_admin_token: "x" }, {})).toBeNull();
    expect(resolveUazapiConfig(null, {})).toBeNull();
  });

  it("adminToken null quando ausente nos dois", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com", uazapi_admin_token: null },
      { url: undefined, adminToken: undefined },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: null });
  });
});
