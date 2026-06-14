import { describe, it, expect, vi } from "vitest";
import { enviarMidia, type SendMediaDeps } from "./send-media";
import type { MessageStatus } from "@/types/database";

const input = { empresaId: "emp-1", conversationId: "conv-1", clientMessageId: "11111111-1111-4111-8111-111111111111", senderId: "user-1", midiaPath: "emp-1/x.pdf", fileBase64: "QkFTRTY0", mime: "application/pdf", fileName: "cv.pdf", caption: "Meu currículo" };
function makeDeps(over: Partial<SendMediaDeps> = {}): SendMediaDeps {
  return {
    loadContext: vi.fn(async () => ({ telefone: "5551999999999", token: "TKN" })),
    isOptedOut: vi.fn(async () => false),
    findByClientId: vi.fn(async () => null),
    insertQueued: vi.fn(async () => ({ id: "msg-1", error: null })),
    reuseFailed: vi.fn(async () => ({ claimed: true, error: null })),
    updateResult: vi.fn(async () => ({ error: null })),
    sendMedia: vi.fn(async () => ({ providerId: "PROV-1" })),
    ...over,
  };
}
describe("enviarMidia", () => {
  it("write-first then sent: inserts queued (with path+tipo), sends, marks sent", async () => {
    const deps = makeDeps();
    const r = await enviarMidia(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.insertQueued).toHaveBeenCalledWith(expect.objectContaining({ midiaPath: "emp-1/x.pdf", tipo: "document", caption: "Meu currículo" }));
    expect(deps.sendMedia).toHaveBeenCalledWith("TKN", "5551999999999", expect.objectContaining({ type: "document", fileBase64: "QkFTRTY0", mimetype: "application/pdf", docName: "cv.pdf", caption: "Meu currículo" }));
    expect(deps.updateResult).toHaveBeenCalledWith("msg-1", { status: "sent", uazapi_msg_id: "PROV-1" });
  });
  it("idempotent no-op for an existing non-failed row", async () => {
    const deps = makeDeps({ findByClientId: vi.fn(async () => ({ id: "m", status: "sent" as MessageStatus })) });
    const r = await enviarMidia(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.sendMedia).not.toHaveBeenCalled();
  });
  it("blocks opt-out", async () => {
    const deps = makeDeps({ isOptedOut: vi.fn(async () => true) });
    expect(await enviarMidia(input, deps)).toEqual({ ok: false, error: "optout" });
  });
  it("marks failed on provider failure", async () => {
    const deps = makeDeps({ sendMedia: vi.fn(async () => ({ providerId: null, error: "boom" })) });
    const r = await enviarMidia(input, deps);
    expect(r.ok).toBe(false);
    expect(deps.updateResult).toHaveBeenCalledWith("msg-1", { status: "failed", error: "boom" });
  });
});
