import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createInstance, instanceStatus, downloadMedia, markChatRead, sendMedia,
  sendText, UazapiError, UAZAPI_TIMEOUT_MS,
} from "./client";

const BASE = "https://fake.uazapi.com";
let fetchMock: ReturnType<typeof vi.fn>;

function mockJson(body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("timeout do provedor", () => {
  it("passa um AbortSignal em toda chamada", async () => {
    mockJson({ messageid: "X" });
    await sendText(BASE, "tok", "5551999", "oi");
    const [, opts] = fetchMock.mock.calls[0];
    expect(opts.signal).toBeInstanceOf(AbortSignal);
  });

  it("converte TimeoutError em UazapiError 504 (vira falha, não trava a bolha)", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("timed out", "TimeoutError"));
    const err = await sendText(BASE, "tok", "5551999", "oi").catch((e) => e);
    expect(err).toBeInstanceOf(UazapiError);
    expect((err as UazapiError).status).toBe(504);
    expect((err as UazapiError).message).toContain(String(UAZAPI_TIMEOUT_MS));
  });

  it("não engole erro de rede que não seja timeout", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(sendText(BASE, "tok", "5551999", "oi")).rejects.toBeInstanceOf(TypeError);
  });
});

describe("createInstance (resposta real: instance é OBJETO)", () => {
  it("usa /instance/init e extrai instance.id e token do topo", async () => {
    mockJson({
      response: "Instance created successfully",
      token: "tok-abc",
      instance: { id: "r183e2ef9597845", name: "sapatao-x", status: "disconnected" },
    });
    const r = await createInstance(BASE, "admin-tok", "sapatao-x");
    expect(r).toEqual({ instanceId: "r183e2ef9597845", token: "tok-abc" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/instance/init`);
    expect(opts.headers.admintoken).toBe("admin-tok");
  });

  it("cai para /instance/create quando o servidor não conhece /instance/init", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({}) });
    mockJson({ token: "tok-legado", instance: { id: "r999" } });
    const r = await createInstance(BASE, "admin-tok", "sapatao-x");
    expect(r).toEqual({ instanceId: "r999", token: "tok-legado" });
    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/instance/init`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${BASE}/instance/create`);
  });

  it("propaga erro que não seja 404 (não tenta o path legado)", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: "unauthorized" }) });
    await expect(createInstance(BASE, "admin-errado", "sapatao-x")).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("instanceStatus (status do topo é OBJETO; string está em instance.status)", () => {
  it("lê instance.status e devolve qr/paircode renovados", async () => {
    mockJson({
      instance: { id: "r1", status: "connecting", qrcode: "data:image/png;base64,QR2", paircode: "1234-5678" },
      status: { connected: false, loggedIn: false },
    });
    const r = await instanceStatus(BASE, "tok");
    expect(r).toEqual({ status: "connecting", qr: "data:image/png;base64,QR2", paircode: "1234-5678" });
  });

  it("deriva de status.connected quando instance.status ausente", async () => {
    mockJson({ instance: {}, status: { connected: true, loggedIn: true } });
    const r = await instanceStatus(BASE, "tok");
    expect(r.status).toBe("connected");
  });
});

describe("downloadMedia (resposta real usa base64Data)", () => {
  it("extrai base64Data + mimetype", async () => {
    mockJson({ fileURL: "https://x/f.mp3", mimetype: "audio/mpeg", base64Data: "UklGRkj" });
    const r = await downloadMedia(BASE, "tok", "3EB0");
    expect(r).toEqual({ base64: "UklGRkj", mime: "audio/mpeg" });
  });
});

describe("markChatRead (spec pede JID)", () => {
  it("anexa @s.whatsapp.net quando faltando", async () => {
    mockJson({ response: "ok" });
    await markChatRead(BASE, "tok", "5551999000001");
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).number).toBe("5551999000001@s.whatsapp.net");
  });
  it("não duplica sufixo", async () => {
    mockJson({ response: "ok" });
    await markChatRead(BASE, "tok", "5551999000001@s.whatsapp.net");
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).number).toBe("5551999000001@s.whatsapp.net");
  });
});

describe("sendMedia (legenda vai em text)", () => {
  it("monta body conforme a spec", async () => {
    mockJson({ messageid: "ABC1" });
    const r = await sendMedia(BASE, "tok", "5551999", {
      type: "document", fileBase64: "AAA=", mimetype: "application/pdf",
      docName: "cv.pdf", caption: "segue",
    });
    expect(r.providerId).toBe("ABC1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/send/media`);
    expect(JSON.parse(opts.body)).toEqual({
      number: "5551999", type: "document", file: "AAA=",
      mimetype: "application/pdf", docName: "cv.pdf", text: "segue",
    });
  });
});
