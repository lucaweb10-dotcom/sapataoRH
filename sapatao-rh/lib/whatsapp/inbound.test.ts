import { describe, it, expect, vi } from "vitest";
import { handleInboundMessage, type DbLike } from "./inbound";
import type { UazapiEvent } from "@/lib/uazapi/webhook-parser";

const ctx = { empresa_id: "emp-1", instance_id: "inst-1" };

const msg = (over: Partial<Extract<UazapiEvent, { kind: "message" }>> = {}): Extract<UazapiEvent, { kind: "message" }> => ({
  kind: "message",
  instanceId: "uazapi-1",
  direction: "inbound",
  messageType: "text",
  content: "Olá",
  phone: "5551999999999",
  providerMessageId: "M1",
  contactName: "Maria Candidata",
  senderName: null,
  wasSentByApi: false,
  mediaMime: null,
  ...over,
});

function makeDb(overrides: Partial<DbLike> = {}): DbLike {
  return {
    upsertCandidato: vi.fn(async () => ({ data: { id: "cand-1" }, error: null })),
    upsertConversation: vi.fn(async () => ({ data: { id: "conv-1" }, error: null })),
    insertMessage: vi.fn(async () => ({ data: { id: "msg-1" }, error: null })),
    insertOptout: vi.fn(async () => ({ data: null, error: null })),
    ...overrides,
  } as DbLike;
}

describe("handleInboundMessage", () => {
  it("creates candidato + conversation + message for a new inbound message", async () => {
    const db = makeDb();
    const result = await handleInboundMessage(msg(), ctx, db);

    expect(result).toMatchObject({ ok: true, candidatoId: "cand-1", conversationId: "conv-1" });
    expect(db.upsertCandidato).toHaveBeenCalledWith(
      expect.objectContaining({
        empresa_id: "emp-1",
        telefone: "5551999999999",
        nome: "Maria Candidata",
      }),
    );
    expect(db.upsertConversation).toHaveBeenCalledWith(
      expect.objectContaining({
        empresa_id: "emp-1",
        candidato_id: "cand-1",
        instance_id: "inst-1",
      }),
    );
    expect(db.insertMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        empresa_id: "emp-1",
        conversation_id: "conv-1",
        uazapi_msg_id: "M1",
        direction: "inbound",
        tipo: "text",
        conteudo: "Olá",
      }),
    );
  });

  it("treats a duplicate uazapi_msg_id (unique violation) as a no-op success", async () => {
    const db = makeDb({
      insertMessage: vi.fn(async () => ({
        data: null,
        error: { code: "23505", message: "duplicate key value violates unique constraint" },
      })),
    });
    const result = await handleInboundMessage(msg(), ctx, db);
    expect(result).toMatchObject({ ok: true });
    // upserts still happened
    expect(db.upsertCandidato).toHaveBeenCalled();
    expect(db.upsertConversation).toHaveBeenCalled();
  });

  it("skips outbound echo (wasSentByApi=true)", async () => {
    const db = makeDb();
    const result = await handleInboundMessage(
      msg({ direction: "outbound", wasSentByApi: true }),
      ctx,
      db,
    );
    expect(result).toEqual({ skipped: "echo" });
    expect(db.upsertCandidato).not.toHaveBeenCalled();
  });

  it("inserts into whatsapp_optouts when message is an opt-out", async () => {
    const db = makeDb();
    const result = await handleInboundMessage(
      msg({ content: "PARAR", providerMessageId: "M2" }),
      ctx,
      db,
    );
    expect(result).toMatchObject({ ok: true });
    expect(db.insertOptout).toHaveBeenCalledWith(
      expect.objectContaining({ empresa_id: "emp-1", telefone: "5551999999999" }),
    );
  });

  it("does not insert optout when message is not an opt-out", async () => {
    const db = makeDb();
    await handleInboundMessage(msg({ content: "Olá, tenho interesse" }), ctx, db);
    expect(db.insertOptout).not.toHaveBeenCalled();
  });
});
