import { describe, it, expect, vi } from "vitest";
import { downloadAndStoreInbound, MEDIA_RETRY_DELAYS_MS, type InboundMediaDeps } from "./media";

const input = { empresaId: "emp-1", providerMessageId: "PROV-1", token: "TKN" };
function makeDeps(over: Partial<InboundMediaDeps> = {}): InboundMediaDeps {
  return {
    getMessage: vi.fn(async () => ({ id: "msg-1", midia_url: null })),
    download: vi.fn(async () => ({ base64: Buffer.from("hello").toString("base64"), mime: "application/pdf" })),
    upload: vi.fn(async () => ({ error: null })),
    setMedia: vi.fn(async () => ({ error: null })),
    sleep: vi.fn(async () => {}), // sem espera real nos testes
    ...over,
  };
}
describe("downloadAndStoreInbound", () => {
  it("downloads, uploads to {empresa}/{provider}.{ext}, sets midia_url/mime", async () => {
    const deps = makeDeps();
    const r = await downloadAndStoreInbound(input, deps);
    expect(r.stored).toBe(true);
    expect(deps.upload).toHaveBeenCalledWith("emp-1/PROV-1.pdf", expect.anything(), "application/pdf");
    expect(deps.setMedia).toHaveBeenCalledWith("msg-1", { midia_url: "emp-1/PROV-1.pdf", midia_mime: "application/pdf" });
  });
  it("is idempotent: skips when the message already has midia_url", async () => {
    const deps = makeDeps({ getMessage: vi.fn(async () => ({ id: "msg-1", midia_url: "emp-1/PROV-1.pdf" })) });
    const r = await downloadAndStoreInbound(input, deps);
    expect(r).toEqual({ stored: false, reason: "already" });
    expect(deps.download).not.toHaveBeenCalled();
  });
  it("no-ops on empty download", async () => {
    const deps = makeDeps({ download: vi.fn(async () => ({ base64: null, mime: null })) });
    const r = await downloadAndStoreInbound(input, deps);
    expect(r).toMatchObject({ stored: false, reason: "empty" });
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("setMedia error → stored:false, reason:set_error (download + upload still called)", async () => {
    const deps = makeDeps({ setMedia: vi.fn(async () => ({ error: { message: "db" } })) });
    const r = await downloadAndStoreInbound(input, deps);
    expect(r).toMatchObject({ stored: false, reason: "set_error" });
    expect(deps.download).toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalled();
  });
});

describe("downloadAndStoreInbound — retry (mídia expira no provedor em ~2 dias)", () => {
  it("uma falha transitória não vira 'Mídia indisponível' permanente", async () => {
    const download = vi
      .fn<InboundMediaDeps["download"]>()
      .mockRejectedValueOnce(new Error("502 bad gateway"))
      .mockResolvedValueOnce({ base64: Buffer.from("ok").toString("base64"), mime: "image/png" });
    const deps = makeDeps({ download });

    const r = await downloadAndStoreInbound(input, deps);

    expect(r.stored).toBe(true);
    expect(r.attempts).toBe(2);
    expect(deps.upload).toHaveBeenCalledWith("emp-1/PROV-1.png", expect.anything(), "image/png");
  });

  it("respeita o backoff entre as tentativas", async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const deps = makeDeps({
      download: vi.fn(async () => {
        throw new Error("timeout");
      }),
      sleep,
    });

    await downloadAndStoreInbound(input, deps);

    expect(deps.download).toHaveBeenCalledTimes(MEDIA_RETRY_DELAYS_MS.length + 1);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual(MEDIA_RETRY_DELAYS_MS);
  });

  it("desiste depois do teto e não sobe nada", async () => {
    const deps = makeDeps({
      download: vi.fn(async () => {
        throw new Error("500");
      }),
    });

    const r = await downloadAndStoreInbound(input, deps);

    expect(r).toMatchObject({ stored: false, reason: "empty", attempts: 3 });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it("resposta vazia (sem exceção) também é retentada", async () => {
    const download = vi
      .fn<InboundMediaDeps["download"]>()
      .mockResolvedValueOnce({ base64: null, mime: null })
      .mockResolvedValueOnce({ base64: Buffer.from("x").toString("base64"), mime: "audio/ogg" });
    const deps = makeDeps({ download });

    const r = await downloadAndStoreInbound(input, deps);

    expect(r.stored).toBe(true);
    expect(r.attempts).toBe(2);
  });
});
