import type { MessageStatus } from "@/types/database";
import { tipoFromMime } from "./media-helpers";

export interface SendMediaDeps {
  loadContext: (conversationId: string) => Promise<{ telefone: string; token: string } | null>;
  isOptedOut: (telefone: string) => Promise<boolean>;
  findByClientId: (clientMessageId: string) => Promise<{ id: string; status: MessageStatus } | null>;
  insertQueued: (row: {
    empresaId: string; conversationId: string; tipo: string; midiaPath: string; caption?: string; clientMessageId: string; senderId: string;
  }) => Promise<{ id: string | null; error: { code?: string; message?: string } | null }>;
  /** Atomic claim: flips status queued only if the row was still failed (rows-affected === 1 → claimed:true). */
  reuseFailed: (messageId: string) => Promise<{ claimed: boolean; error: { message?: string } | null }>;
  updateResult: (
    messageId: string,
    fields: { status: "sent"; uazapi_msg_id: string } | { status: "failed"; error: string },
  ) => Promise<{ error: { message?: string } | null }>;
  sendMedia: (token: string, number: string, args: { type: "image" | "video" | "audio" | "ptt" | "document"; fileBase64: string; mimetype: string; docName?: string; caption?: string }) => Promise<{ providerId: string | null; error?: string }>;
}

export interface SendMediaInput {
  empresaId: string;
  conversationId: string;
  clientMessageId: string;
  senderId: string;
  midiaPath: string;
  fileBase64: string;
  mime: string;
  fileName?: string;
  caption?: string;
}

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; error: "optout" | "context_error" | "send_failed" | "insert_failed" | "reuse_failed"; messageId?: string };

export async function enviarMidia(input: SendMediaInput, deps: SendMediaDeps): Promise<SendResult> {
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

  const tipo = tipoFromMime(input.mime);

  let messageId: string;
  if (existing && existing.status === "failed") {
    // Atomic claim: only this caller proceeds when rows-affected === 1.
    const claim = await deps.reuseFailed(existing.id);
    if (claim.error) {
      return { ok: false, error: "reuse_failed", messageId: existing.id };
    }
    if (!claim.claimed) {
      // Another concurrent retry already claimed this row — treat as no-op.
      return { ok: true, messageId: existing.id };
    }
    messageId = existing.id;
  } else {
    const ins = await deps.insertQueued({
      empresaId: input.empresaId,
      conversationId: input.conversationId,
      tipo,
      midiaPath: input.midiaPath,
      caption: input.caption,
      clientMessageId: input.clientMessageId,
      senderId: input.senderId,
    });
    if (!ins.id) {
      if (ins.error?.code === "23505") {
        // Unique-index race — re-select the winning row.
        const winner = await deps.findByClientId(input.clientMessageId);
        if (winner) return { ok: true, messageId: winner.id };
      }
      // Real insert failure or 23505 with no winner found.
      console.error(ins.error?.message);
      return { ok: false, error: "insert_failed" };
    }
    messageId = ins.id;
  }

  const sent = await deps.sendMedia(ctx.token, ctx.telefone, {
    type: tipo,
    fileBase64: input.fileBase64,
    mimetype: input.mime,
    ...(input.fileName ? { docName: input.fileName } : {}),
    ...(input.caption ? { caption: input.caption } : {}),
  });
  if (!sent.providerId) {
    await deps.updateResult(messageId, { status: "failed", error: sent.error ?? "send_failed" });
    return { ok: false, error: "send_failed", messageId };
  }
  const upd = await deps.updateResult(messageId, { status: "sent", uazapi_msg_id: sent.providerId });
  if (upd.error) {
    // Logged inconsistency — message sent but status flip failed; the webhook reconciles.
    console.error(upd.error.message);
  }
  return { ok: true, messageId };
}
