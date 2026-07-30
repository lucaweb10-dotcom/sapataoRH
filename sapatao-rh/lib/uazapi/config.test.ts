import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  resolveUazapiConfig,
  getUazapiConfig,
  invalidateUazapiConfig,
  __resetUazapiConfigCache,
} from "./config";

/** Admin client falso: conta quantas vezes o banco foi consultado. */
function fakeAdmin(row: { uazapi_base_url: string | null; uazapi_admin_token: string | null } | null, error: unknown = null) {
  const maybeSingle = vi.fn(async () => ({ data: row, error }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  return { client: { from } as never, calls: () => maybeSingle.mock.calls.length };
}

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

describe("getUazapiConfig — cache de 60s", () => {
  beforeEach(() => __resetUazapiConfigCache());

  const ROW = { uazapi_base_url: "https://db.uazapi.com", uazapi_admin_token: "tok-db" };

  it("consulta o banco uma vez e serve as seguintes do cache", async () => {
    const { client, calls } = fakeAdmin(ROW);
    let t = 0;
    const now = () => t;

    const a = await getUazapiConfig(client, "emp-1", now);
    t = 59_000;
    const b = await getUazapiConfig(client, "emp-1", now);

    expect(a).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: "tok-db" });
    expect(b).toEqual(a);
    expect(calls()).toBe(1);
  });

  it("reconsulta depois do TTL", async () => {
    const { client, calls } = fakeAdmin(ROW);
    let t = 0;
    const now = () => t;

    await getUazapiConfig(client, "emp-1", now);
    t = 60_001;
    await getUazapiConfig(client, "emp-1", now);

    expect(calls()).toBe(2);
  });

  it("cacheia por empresa (um tenant não serve o outro)", async () => {
    const { client, calls } = fakeAdmin(ROW);
    const now = () => 0;

    await getUazapiConfig(client, "emp-1", now);
    await getUazapiConfig(client, "emp-2", now);

    expect(calls()).toBe(2);
  });

  it("invalidate() força releitura na hora (troca de credencial pela UI)", async () => {
    const { client, calls } = fakeAdmin(ROW);
    const now = () => 0;

    await getUazapiConfig(client, "emp-1", now);
    invalidateUazapiConfig("emp-1");
    await getUazapiConfig(client, "emp-1", now);

    expect(calls()).toBe(2);
  });

  it("não cacheia erro de leitura — um blip não pode cegar o envio por 60s", async () => {
    const { client, calls } = fakeAdmin(null, { message: "boom" });
    const now = () => 0;

    await getUazapiConfig(client, "emp-1", now);
    await getUazapiConfig(client, "emp-1", now);

    expect(calls()).toBe(2);
  });
});
