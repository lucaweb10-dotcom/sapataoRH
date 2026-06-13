import { describe, it, expect, vi } from "vitest";
import { enviarMensagem, type SendDeps } from "./send";

const input = { empresaId: "emp-1", conversationId: "conv-1", texto: "Olá", clientMessageId: "11111111-1111-4111-8111-111111111111", senderId: "user-1" };

function makeDeps(over: Partial<SendDeps> = {}): SendDeps {
  return {
    loadContext: vi.fn(async () => ({ telefone: "5551999999999", token: "TKN" })),
    isOptedOut: vi.fn(async () => false),
    findByClientId: vi.fn(async () => null),
    insertQueued: vi.fn(async () => ({ id: "msg-1", error: null })),
    reuseFailed: vi.fn(async () => ({ claimed: true, error: null })),
    updateResult: vi.fn(async () => ({ error: null })),
    sendText: vi.fn(async () => ({ providerId: "PROV-1" })),
    ...over,
  };
}

describe("enviarMensagem", () => {
  it("write-first then sent: inserts queued, calls sendText, marks sent", async () => {
    const deps = makeDeps();
    const r = await enviarMensagem(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.insertQueued).toHaveBeenCalled();
    expect(deps.sendText).toHaveBeenCalledWith("TKN", "5551999999999", "Olá");
    expect(deps.updateResult).toHaveBeenCalledWith("msg-1", { status: "sent", uazapi_msg_id: "PROV-1" });
  });
  it("idempotent: existing non-failed row is a no-op", async () => {
    const deps = makeDeps({ findByClientId: vi.fn(async () => ({ id: "msg-x", status: "sent" as const })) });
    const r = await enviarMensagem(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.insertQueued).not.toHaveBeenCalled();
    expect(deps.sendText).not.toHaveBeenCalled();
  });
  it("reuses a failed row instead of inserting a duplicate", async () => {
    const deps = makeDeps({ findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as const })) });
    const r = await enviarMensagem(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.reuseFailed).toHaveBeenCalledWith("msg-f");
    expect(deps.insertQueued).not.toHaveBeenCalled();
    expect(deps.sendText).toHaveBeenCalled();
  });
  it("blocks opt-out without inserting", async () => {
    const deps = makeDeps({ isOptedOut: vi.fn(async () => true) });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: false, error: "optout" });
    expect(deps.insertQueued).not.toHaveBeenCalled();
  });
  it("marks failed when the provider fails", async () => {
    const deps = makeDeps({ sendText: vi.fn(async () => ({ providerId: null, error: "boom" })) });
    const r = await enviarMensagem(input, deps);
    expect(r.ok).toBe(false);
    expect(deps.updateResult).toHaveBeenCalledWith("msg-1", { status: "failed", error: "boom" });
  });
  it("returns context_error if the conversation/instance can't be loaded", async () => {
    const deps = makeDeps({ loadContext: vi.fn(async () => null) });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: false, error: "context_error" });
  });

  // ── new: insert-race scenarios ────────────────────────────────────────────────

  it("race-win: 23505 + winner found → ok with winner id, no send", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23505" } })),
      findByClientId: vi
        .fn()
        .mockResolvedValueOnce(null) // first call (idempotency check) → no existing row
        .mockResolvedValueOnce({ id: "msg-win", status: "queued" as const }), // second call (race re-select)
    });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: true, messageId: "msg-win" });
    expect(deps.sendText).not.toHaveBeenCalled();
  });

  it("race-no-winner / insert_failed: 23505 but no winner found → insert_failed", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23505" } })),
      findByClientId: vi.fn(async () => null), // both calls return null
    });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: false, error: "insert_failed" });
  });

  it("non-23505 insert error → insert_failed (not masked as context_error)", async () => {
    const deps = makeDeps({
      insertQueued: vi.fn(async () => ({ id: null, error: { code: "23502", message: "not null" } })),
    });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: false, error: "insert_failed" });
  });

  // ── new: reuseFailed concurrency scenarios ────────────────────────────────────

  it("reuseFailed error → reuse_failed, sendText not called", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as const })),
      reuseFailed: vi.fn(async () => ({ claimed: false, error: { message: "boom" } })),
    });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: false, error: "reuse_failed", messageId: "msg-f" });
    expect(deps.sendText).not.toHaveBeenCalled();
  });

  it("reuseFailed not claimed (concurrent) → ok no-op, sendText not called", async () => {
    const deps = makeDeps({
      findByClientId: vi.fn(async () => ({ id: "msg-f", status: "failed" as const })),
      reuseFailed: vi.fn(async () => ({ claimed: false, error: null })),
    });
    const r = await enviarMensagem(input, deps);
    expect(r).toEqual({ ok: true, messageId: "msg-f" });
    expect(deps.sendText).not.toHaveBeenCalled();
  });

  // ── new: updateResult error still returns ok (message went out) ───────────────

  it("updateResult error on sent path still returns ok (message sent, webhook reconciles)", async () => {
    const deps = makeDeps({
      updateResult: vi.fn(async () => ({ error: { message: "x" } })),
      sendText: vi.fn(async () => ({ providerId: "PROV-2" })),
    });
    const r = await enviarMensagem(input, deps);
    expect(r.ok).toBe(true);
  });
});
