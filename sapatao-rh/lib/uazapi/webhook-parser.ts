// ⚠️ FIELD PATHS ASSUMED FROM THE ESPELHO — validate against a captured live UAZAPI v2
// payload before relying in production: message.chat.{wa_name|wa_contactName|name} (contactName),
// message.chatid|phone (phone), message.fromMe, message.messageType, message.text|conteudo|body,
// message.wasSentByApi, message.mimetype|mime, top-level instance|instanceName|instance_id.

import { extractMessageId, normalizeStatus } from "./extract";
import { normalizePhone } from "./phone";

export type UazapiEvent =
  | {
      kind: "message";
      instanceId: string | null;
      direction: "inbound" | "outbound";
      messageType: string;
      content: string;
      phone: string;
      providerMessageId: string;
      contactName: string | null;
      senderName: string | null;
      wasSentByApi: boolean;
      mediaMime: string | null;
    }
  | {
      kind: "status";
      providerMessageId: string;
      status: "sent" | "delivered" | "read" | "failed" | "deleted";
    }
  | {
      kind: "connection";
      instanceId: string | null;
      state: "connected" | "connecting" | "disconnected";
    }
  | { kind: "ignore" };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function contactNameFromChat(chat: Obj): string | null {
  return str(chat["wa_name"]) ?? str(chat["wa_contactName"]) ?? str(chat["name"]) ?? null;
}

function mimeFromContent(m: Obj): string | null {
  const c = m["content"];
  if (c && typeof c === "object") return str((c as Obj)["mimetype"]);
  if (typeof c === "string" && c.startsWith("{")) {
    try {
      return str((JSON.parse(c) as Obj)["mimetype"]);
    } catch {
      return null;
    }
  }
  return null;
}

// Payload real (whatsmeow via UAZAPI): para MÍDIA, os campos normalizados `type`/`mediaType`
// vêm VAZIOS e o tipo real fica em `messageType` com o nome BRUTO do WhatsApp
// ("AudioMessage", "ImageMessage", ...). Mapear para o nosso enum, senão a mídia era
// classificada como "text" e o download nunca disparava.
const RAW_TIPO: Record<string, string> = {
  conversation: "text",
  extendedtextmessage: "text",
  imagemessage: "image",
  videomessage: "video",
  audiomessage: "audio",
  pttmessage: "ptt",
  voicemessage: "ptt",
  documentmessage: "document",
  documentwithcaptionmessage: "document",
  stickermessage: "sticker",
};

/** Resolve o tipo da mensagem: prefere os campos normalizados; se vazios, mapeia o nome bruto. */
function tipoFromMessage(m: Obj): string {
  const norm = (str(m["type"]) ?? str(m["mediaType"]) ?? "").toLowerCase();
  if (norm) return RAW_TIPO[norm] ?? norm;
  const raw = (str(m["messageType"]) ?? "").toLowerCase();
  return RAW_TIPO[raw] ?? "text";
}

export function parseUazapiEvent(raw: unknown): UazapiEvent {
  const p = asObj(raw);
  const event = str(p["event"]) ?? str(p["EventType"]);
  const instanceId = str(p["instance"]) ?? str(p["instanceName"]) ?? str(p["instance_id"]);

  if (event === "connection") {
    const s = (str(p["state"]) ?? str(p["status"]) ?? "").toLowerCase();
    const state =
      s === "open" || s === "connected"
        ? "connected"
        : s === "connecting" || s === "syncing"
          ? "connecting"
          : "disconnected";
    return { kind: "connection", instanceId, state };
  }

  if (event === "messages_update" || (p["status"] && p["messageid"] && !p["message"])) {
    // Payload real (capturado ao vivo): recibo whatsmeow — ids em event.MessageIDs[],
    // status em `state` (topo) ou event.Type ("Read"/"Delivered").
    const ev = asObj(p["event"]);
    const messageIds = Array.isArray(ev["MessageIDs"])
      ? (ev["MessageIDs"] as unknown[]).filter((x): x is string => typeof x === "string")
      : [];
    const id = extractMessageId(p) ?? messageIds[0] ?? null;
    const status =
      normalizeStatus(p["status"]) ?? normalizeStatus(p["state"]) ?? normalizeStatus(ev["Type"]);
    if (id && status) return { kind: "status", providerMessageId: id, status };
    return { kind: "ignore" };
  }

  if (event === "messages") {
    const m = asObj(p["message"]);
    const id = extractMessageId(m);
    if (!id) return { kind: "ignore" };
    // Payload real (capturado ao vivo): grupos chegam com isGroup=true e chatid @g.us.
    // Grupo não é candidato — ignorar para não criar registros com telefone inválido.
    if (m["isGroup"] === true || (str(m["chatid"]) ?? "").includes("@g.us")) {
      return { kind: "ignore" };
    }
    // Payload real: `chat` (com wa_name/wa_contactName/name) é irmão de `message` no topo.
    const chat = asObj(m["chat"]);
    const topChat = asObj(p["chat"]);
    const fromMe = m["fromMe"] === true;
    return {
      kind: "message",
      instanceId,
      direction: fromMe ? "outbound" : "inbound",
      // Payload real: `messageType` é o tipo bruto do WA ("Conversation", "AudioMessage");
      // para mídia `type`/`mediaType` vêm vazios — ver tipoFromMessage.
      messageType: tipoFromMessage(m),
      content: str(m["text"]) ?? str(m["conteudo"]) ?? str(m["body"]) ?? "",
      phone: normalizePhone(str(m["chatid"]) ?? str(m["phone"]) ?? ""),
      providerMessageId: id,
      contactName: contactNameFromChat(chat) ?? contactNameFromChat(topChat),
      senderName: str(m["senderName"]),
      wasSentByApi: m["wasSentByApi"] === true,
      mediaMime: str(m["mimetype"]) ?? str(m["mime"]) ?? mimeFromContent(m),
    };
  }

  return { kind: "ignore" };
}
