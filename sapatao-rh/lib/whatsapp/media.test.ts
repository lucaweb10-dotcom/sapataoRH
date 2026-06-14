import { describe, it, expect, vi } from "vitest";
import { downloadAndStoreInbound, type InboundMediaDeps } from "./media";

const input = { empresaId: "emp-1", providerMessageId: "PROV-1", token: "TKN" };
function makeDeps(over: Partial<InboundMediaDeps> = {}): InboundMediaDeps {
  return {
    getMessage: vi.fn(async () => ({ id: "msg-1", midia_url: null })),
    download: vi.fn(async () => ({ base64: Buffer.from("hello").toString("base64"), mime: "application/pdf" })),
    upload: vi.fn(async () => ({ error: null })),
    setMedia: vi.fn(async () => ({ error: null })),
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
    expect(r).toEqual({ stored: false, reason: "empty" });
    expect(deps.upload).not.toHaveBeenCalled();
  });
  it("setMedia error → stored:false, reason:set_error (download + upload still called)", async () => {
    const deps = makeDeps({ setMedia: vi.fn(async () => ({ error: { message: "db" } })) });
    const r = await downloadAndStoreInbound(input, deps);
    expect(r).toEqual({ stored: false, reason: "set_error" });
    expect(deps.download).toHaveBeenCalled();
    expect(deps.upload).toHaveBeenCalled();
  });
});
