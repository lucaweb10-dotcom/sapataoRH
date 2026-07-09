import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createInstance, instanceStatus, downloadMedia, markChatRead, sendMedia,
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

describe("createInstance (resposta real: instance é OBJETO)", () => {
  it("extrai instance.id e token do topo", async () => {
    mockJson({
      response: "Instance created successfully",
      token: "tok-abc",
      instance: { id: "r183e2ef9597845", name: "sapatao-x", status: "disconnected" },
    });
    const r = await createInstance(BASE, "admin-tok", "sapatao-x");
    expect(r).toEqual({ instanceId: "r183e2ef9597845", token: "tok-abc" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/instance/create`);
    expect(opts.headers.admintoken).toBe("admin-tok");
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
