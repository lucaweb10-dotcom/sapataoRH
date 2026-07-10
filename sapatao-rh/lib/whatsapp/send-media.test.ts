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
  it("voiceNote: true forces tipo 'ptt' on insert and sendMedia", async () => {
    const deps = makeDeps();
    const r = await enviarMidia({ ...input, mime: "audio/webm", voiceNote: true }, deps);
    expect(r.ok).toBe(true);
    expect(deps.insertQueued).toHaveBeenCalledWith(expect.objectContaining({ tipo: "ptt" }));
    expect(deps.sendMedia).toHaveBeenCalledWith("TKN", "5551999999999", expect.objectContaining({ type: "ptt" }));
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

  // ── reuseFailed concurrency scenarios ────────────────────────────────────────

  it("reuseFailed claimed → send proceeds, marks sent", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as MessageStatus })),
      reuseFailed: vi.fn(async () => ({ claimed: true, error: null })),
    });
    const r = await enviarMidia(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.reuseFailed).toHaveBeenCalledWith("msg-f");
    expect(deps.insertQueued).not.toHaveBeenCalled();
    expect(deps.sendMedia).toHaveBeenCalled();
  });

  it("reuseFailed claimed + voiceNote: true (retry) → sendMedia called with type 'ptt'", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as MessageStatus })),
      reuseFailed: vi.fn(async () => ({ claimed: true, error: null })),
    });
    const r = await enviarMidia({ ...input, mime: "audio/webm", voiceNote: true }, deps);
    expect(r.ok).toBe(true);
    expect(deps.sendMedia).toHaveBeenCalledWith("TKN", "5551999999999", expect.objectContaining({ type: "ptt" }));
  });

  it("reuseFailed not claimed (concurrent) → ok no-op, sendMedia not called", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as MessageStatus })),
      reuseFailed: vi.fn(async () => ({ claimed: false, error: null })),
    });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: true, messageId: "msg-f" });
    expect(deps.sendMedia).not.toHaveBeenCalled();
  });

  it("reuseFailed error → reuse_failed, sendMedia not called", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as MessageStatus })),
      reuseFailed: vi.fn(async () => ({ claimed: false, error: { message: "boom" } })),
    });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: false, error: "reuse_failed", messageId: "msg-f" });
    expect(deps.sendMedia).not.toHaveBeenCalled();
  });

  // ── insert-race scenarios ─────────────────────────────────────────────────────

  it("race-win: 23505 + winner found → ok with winner id, sendMedia not called", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23505" } })),
      findByClientId: vi
        .fn()
        .mockResolvedValueOnce(null) // first call (idempotency check) → no existing row
        .mockResolvedValueOnce({ id: "msg-win", status: "queued" as MessageStatus }), // second call (race re-select)
    });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: true, messageId: "msg-win" });
    expect(deps.sendMedia).not.toHaveBeenCalled();
  });

  it("race-no-winner: 23505 but no winner found → insert_failed", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23505" } })),
      findByClientId: vi.fn(async () => null), // both calls return null
    });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: false, error: "insert_failed" });
  });

  it("non-23505 insert error → insert_failed", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23502", message: "not null" } })),
    });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: false, error: "insert_failed" });
  });

  // ── context_error ─────────────────────────────────────────────────────────────

  it("context_error: loadContext returns null → context_error, sendMedia not called", async () => {
    const deps = makeDeps({ loadContext: vi.fn(async () => null) });
    const r = await enviarMidia(input, deps);
    expect(r).toEqual({ ok: false, error: "context_error" });
    expect(deps.sendMedia).not.toHaveBeenCalled();
  });

  // ── updateResult error still returns ok (message sent, webhook reconciles) ────

  it("updateResult error on sent path still returns ok", async () => {
    const deps = makeDeps({
      updateResult: vi.fn(async () => ({ error: { message: "x" } })),
      sendMedia: vi.fn(async () => ({ providerId: "PROV-2" })),
    });
    const r = await enviarMidia(input, deps);
    expect(r.ok).toBe(true);
  });
});
