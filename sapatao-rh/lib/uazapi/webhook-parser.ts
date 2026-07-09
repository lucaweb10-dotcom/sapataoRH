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
    const id = extractMessageId(p);
    const status = normalizeStatus(p["status"]);
    if (id && status) return { kind: "status", providerMessageId: id, status };
    return { kind: "ignore" };
  }

  if (event === "messages") {
    const m = asObj(p["message"]);
    const id = extractMessageId(m);
    if (!id) return { kind: "ignore" };
    const chat = asObj(m["chat"]);
    const fromMe = m["fromMe"] === true;
    return {
      kind: "message",
      instanceId,
      direction: fromMe ? "outbound" : "inbound",
      messageType: str(m["messageType"]) ?? "text",
      content: str(m["text"]) ?? str(m["conteudo"]) ?? str(m["body"]) ?? "",
      phone: normalizePhone(str(m["chatid"]) ?? str(m["phone"]) ?? ""),
      providerMessageId: id,
      contactName: contactNameFromChat(chat),
      senderName: str(m["senderName"]),
      wasSentByApi: m["wasSentByApi"] === true,
      mediaMime: str(m["mimetype"]) ?? str(m["mime"]) ?? mimeFromContent(m),
    };
  }

  return { kind: "ignore" };
}
