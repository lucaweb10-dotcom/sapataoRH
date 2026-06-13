import type { MessageStatus } from "@/types/database";

export interface SendDeps {
  loadContext: (conversationId: string) => Promise<{ telefone: string; token: string } | null>;
  isOptedOut: (telefone: string) => Promise<boolean>;
  findByClientId: (clientMessageId: string) => Promise<{ id: string; status: MessageStatus } | null>;
  insertQueued: (row: {
    empresaId: string; conversationId: string; texto: string; clientMessageId: string; senderId: string;
  }) => Promise<{ id: string | null; error: { code?: string; message?: string } | null }>;
  reuseFailed: (messageId: string) => Promise<{ error: { message?: string } | null }>;
  updateResult: (
    messageId: string,
    fields: { status: "sent"; uazapi_msg_id: string } | { status: "failed"; error: string },
  ) => Promise<{ error: { message?: string } | null }>;
  sendText: (token: string, number: string, text: string) => Promise<{ providerId: string | null; error?: string }>;
}

export interface SendInput {
  empresaId: string; conversationId: string; texto: string; clientMessageId: string; senderId: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: "optout" | "context_error" | "send_failed"; messageId?: string };

export async function enviarMensagem(input: SendInput, deps: SendDeps): Promise<SendResult> {
  const ctx = await deps.loadContext(input.conversationId);
  if (!ctx) return { ok: false, error: "context_error" };

  // Idempotency
  const existing = await deps.findByClientId(input.clientMessageId);
  if (existing && existing.status !== "failed") {
    return { ok: true, messageId: existing.id }; // double-submit no-op
  }

  if (await deps.isOptedOut(ctx.telefone)) {
    return { ok: false, error: "optout" };
  }

  let messageId: string;
  if (existing && existing.status === "failed") {
    await deps.reuseFailed(existing.id); // back to queued
    messageId = existing.id;
  } else {
    const ins = await deps.insertQueued({
      empresaId: input.empresaId,
      conversationId: input.conversationId,
      texto: input.texto,
      clientMessageId: input.clientMessageId,
      senderId: input.senderId,
    });
    if (!ins.id) {
      // race on the unique index → re-select the winning row
      const winner = await deps.findByClientId(input.clientMessageId);
      if (winner) return { ok: true, messageId: winner.id };
      return { ok: false, error: "context_error" };
    }
    messageId = ins.id;
  }

  const sent = await deps.sendText(ctx.token, ctx.telefone, input.texto);
  if (!sent.providerId) {
    await deps.updateResult(messageId, { status: "failed", error: sent.error ?? "send_failed" });
    return { ok: false, error: "send_failed", messageId };
  }
  await deps.updateResult(messageId, { status: "sent", uazapi_msg_id: sent.providerId });
  return { ok: true, messageId };
}
