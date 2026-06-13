import type { UazapiEvent } from "@/lib/uazapi/webhook-parser";
import { isOptOut } from "@/lib/uazapi/phone";

export interface DbLike {
  upsertCandidato: (input: {
    empresa_id: string;
    telefone: string;
    nome: string;
  }) => Promise<{ data: { id: string } | null; error: { code?: string; message: string } | null }>;

  upsertConversation: (input: {
    empresa_id: string;
    candidato_id: string;
    instance_id: string;
  }) => Promise<{ data: { id: string } | null; error: { code?: string; message: string } | null }>;

  insertMessage: (input: {
    empresa_id: string;
    conversation_id: string;
    uazapi_msg_id: string;
    direction: "inbound" | "outbound";
    tipo: string;
    conteudo: string;
  }) => Promise<{ data: { id: string } | null; error: { code?: string; message: string } | null }>;

  insertOptout: (input: {
    empresa_id: string;
    telefone: string;
  }) => Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
}

export type InboundContext = {
  empresa_id: string;
  instance_id: string;
};

export type InboundResult =
  | { ok: true; candidatoId: string; conversationId: string }
  | { skipped: "outbound" | "no-id" };

const DEDUP_ERROR_CODE = "23505";

export async function handleInboundMessage(
  event: Extract<UazapiEvent, { kind: "message" }>,
  ctx: InboundContext,
  db: DbLike,
): Promise<InboundResult> {
  // 1. Skip all outbound messages (recruiter's own phone or API-sent echoes)
  if (event.direction === "outbound") {
    return { skipped: "outbound" };
  }

  // 2. Guard: require a provider message ID
  if (!event.providerMessageId) {
    return { skipped: "no-id" };
  }

  const { empresa_id, instance_id } = ctx;

  // 3. Upsert candidato
  const { data: candidatoData, error: candidatoError } = await db.upsertCandidato({
    empresa_id,
    telefone: event.phone,
    nome: event.contactName ?? "Desconhecido",
  });

  if (candidatoError || !candidatoData) {
    throw new Error(`upsertCandidato failed: ${candidatoError?.message ?? "no data"}`);
  }

  const candidatoId = candidatoData.id;

  // 4. Upsert conversation
  const { data: convData, error: convError } = await db.upsertConversation({
    empresa_id,
    candidato_id: candidatoId,
    instance_id,
  });

  if (convError || !convData) {
    throw new Error(`upsertConversation failed: ${convError?.message ?? "no data"}`);
  }

  const conversationId = convData.id;

  // 5. Insert message (dedup on unique violation)
  const { error: msgError } = await db.insertMessage({
    empresa_id,
    conversation_id: conversationId,
    uazapi_msg_id: event.providerMessageId,
    direction: event.direction,
    tipo: event.messageType,
    conteudo: event.content,
  });

  if (msgError && msgError.code !== DEDUP_ERROR_CODE) {
    throw new Error(`insertMessage failed: ${msgError.message}`);
  }

  // 6. Opt-out check
  if (isOptOut(event.content)) {
    await db.insertOptout({ empresa_id, telefone: event.phone });
  }

  return { ok: true, candidatoId, conversationId };
}
