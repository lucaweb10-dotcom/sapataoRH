import { describe, it, expect } from "vitest";
import { parseUazapiEvent } from "./webhook-parser";

const inbound = {
  event: "messages",
  instance: "inst-1",
  message: {
    messageid: "M1", fromMe: false, messageType: "text",
    text: "Olá, tenho interesse na vaga",
    chatid: "5551999999999@s.whatsapp.net",
    senderName: "Recrutador X", // must be IGNORED for contactName
    chat: { wa_name: "Maria Candidata" },
    wasSentByApi: false,
  },
};

describe("parseUazapiEvent", () => {
  it("parses an inbound text message, taking contactName from chat (not senderName)", () => {
    const e = parseUazapiEvent(inbound);
    expect(e.kind).toBe("message");
    if (e.kind !== "message") throw new Error("kind");
    expect(e.direction).toBe("inbound");
    expect(e.providerMessageId).toBe("M1");
    expect(e.phone).toBe("5551999999999");
    expect(e.content).toBe("Olá, tenho interesse na vaga");
    expect(e.contactName).toBe("Maria Candidata");
    expect(e.wasSentByApi).toBe(false);
  });
  it("flags outbound echo (fromMe + wasSentByApi)", () => {
    const e = parseUazapiEvent({ event: "messages", instance: "i", message: { messageid: "M2", fromMe: true, wasSentByApi: true, chatid: "5551@s.whatsapp.net", text: "oi", chat: { wa_name: "X" } } });
    if (e.kind !== "message") throw new Error("kind");
    expect(e.direction).toBe("outbound");
    expect(e.wasSentByApi).toBe(true);
  });
  it("parses a status update", () => {
    const e = parseUazapiEvent({ event: "messages_update", messageid: "M1", status: "Read" });
    expect(e.kind).toBe("status");
    if (e.kind !== "status") throw new Error("kind");
    expect(e.providerMessageId).toBe("M1");
    expect(e.status).toBe("read");
  });
  it("parses a connection event", () => {
    const e = parseUazapiEvent({ event: "connection", instance: "i", state: "open" });
    expect(e.kind).toBe("connection");
    if (e.kind !== "connection") throw new Error("kind");
    expect(e.state).toBe("connected");
  });
  it("returns ignore for unknown/missing-id", () => {
    expect(parseUazapiEvent({ event: "messages", message: { fromMe: false } }).kind).toBe("ignore");
    expect(parseUazapiEvent({ event: "presence" }).kind).toBe("ignore");
  });

  it("preserves senderName in the main inbound message", () => {
    const e = parseUazapiEvent(inbound);
    if (e.kind !== "message") throw new Error("kind");
    expect(e.senderName).toBe("Recrutador X");
  });

  it("connection mapping: state variants", () => {
    const conn = (extra: object) => parseUazapiEvent({ event: "connection", ...extra });
    expect((conn({ state: "connecting" }) as { state: string }).state).toBe("connecting");
    expect((conn({ state: "syncing" }) as { state: string }).state).toBe("connecting");
    expect((conn({ state: "close" }) as { state: string }).state).toBe("disconnected");
    expect((conn({ status: "open" }) as { state: string }).state).toBe("connected");
    expect((conn({}) as { state: string }).state).toBe("disconnected");
  });

  it("status heuristic: known status → 'status', unknown → 'ignore'", () => {
    expect(parseUazapiEvent({ messageid: "M9", status: "Read" }).kind).toBe("status");
    expect(parseUazapiEvent({ event: "messages_update", messageid: "M9", status: "weird" }).kind).toBe("ignore");
  });

  it("contactName fallback chain: wa_contactName, name, null", () => {
    const makeMsg = (chat: object) =>
      parseUazapiEvent({ event: "messages", instance: "i", message: { messageid: "MX", fromMe: false, chat } });

    const e1 = makeMsg({ wa_contactName: "Joana" });
    if (e1.kind !== "message") throw new Error("kind");
    expect(e1.contactName).toBe("Joana");

    const e2 = makeMsg({ name: "X" });
    if (e2.kind !== "message") throw new Error("kind");
    expect(e2.contactName).toBe("X");

    const e3 = makeMsg({});
    if (e3.kind !== "message") throw new Error("kind");
    expect(e3.contactName).toBeNull();
  });
});

describe("tolerância de envelope (SP1d)", () => {
  it("aceita EventType como sinônimo de event", () => {
    const e = parseUazapiEvent({
      EventType: "messages",
      instance: "inst-1",
      message: { messageid: "M1", chatid: "5551999@s.whatsapp.net", fromMe: false, text: "oi" },
    });
    expect(e.kind).toBe("message");
  });

  it("extrai mimetype de message.content objeto", () => {
    const e = parseUazapiEvent({
      event: "messages",
      message: {
        messageid: "M2", chatid: "5551999@s.whatsapp.net", fromMe: false,
        messageType: "image", content: { mimetype: "image/jpeg", caption: "" },
      },
    });
    expect(e.kind).toBe("message");
    if (e.kind === "message") expect(e.mediaMime).toBe("image/jpeg");
  });

  it("extrai mimetype de message.content JSON serializado", () => {
    const e = parseUazapiEvent({
      event: "messages",
      message: {
        messageid: "M3", chatid: "5551999@s.whatsapp.net", fromMe: false,
        messageType: "document", content: '{"mimetype":"application/pdf"}',
      },
    });
    if (e.kind === "message") expect(e.mediaMime).toBe("application/pdf");
  });
});

// Casos derivados de PAYLOAD REAL capturado do servidor first360.uazapi.com (2026-07-09)
// via GET /webhook/errors — envelope: { BaseUrl, EventType, chat (topo), instanceName, message, owner }.
describe("payload real UAZAPI (capturado ao vivo)", () => {
  const realGroupMsg = {
    BaseUrl: "https://first360.uazapi.com",
    EventType: "messages",
    instanceName: "f360_11111111_7710c6c1",
    owner: "555181899843",
    chat: { wa_chatid: "555195073167-1519167853@g.us", wa_name: "Elitecar Vendas interno", name: "Elitecar Vendas interno", wa_contactName: "", phone: "" },
    message: {
      chatid: "555195073167-1519167853@g.us", content: "Gle400 preto novo valor 249.900",
      fromMe: false, groupName: "Elitecar Vendas interno", id: "555181899843:2AA999A91D92CED73F99",
      isGroup: true, mediaType: "", messageType: "Conversation", messageid: "2AA999A91D92CED73F99",
      owner: "555181899843", sender: "59073013796887@lid", senderName: "Fernando Moura",
      text: "Gle400 preto novo valor 249.900", type: "text", wasSentByApi: false,
    },
  };

  it("ignora mensagem de grupo (isGroup/@g.us) — grupo nao vira candidato", () => {
    expect(parseUazapiEvent(realGroupMsg).kind).toBe("ignore");
  });

  it("DM real: usa type normalizado (nao o messageType bruto) e chat do topo p/ nome", () => {
    const dm = {
      ...realGroupMsg,
      chat: { wa_chatid: "5551999888777@s.whatsapp.net", wa_name: "Maria Candidata", name: "Maria Candidata", wa_contactName: "", phone: "" },
      message: { ...realGroupMsg.message, chatid: "5551999888777@s.whatsapp.net", isGroup: false, groupName: undefined, senderName: "Maria Candidata" },
    };
    const e = parseUazapiEvent(dm);
    expect(e.kind).toBe("message");
    if (e.kind === "message") {
      expect(e.messageType).toBe("text");
      expect(e.phone).toBe("5551999888777");
      expect(e.contactName).toBe("Maria Candidata");
      expect(e.direction).toBe("inbound");
    }
  });

  it("midia real: mediaType/type normalizados tem prioridade sobre messageType bruto", () => {
    const media = {
      ...realGroupMsg,
      message: { ...realGroupMsg.message, chatid: "5551999888777@s.whatsapp.net", isGroup: false, messageType: "ImageMessage", type: "image", mediaType: "image", text: "" },
    };
    const e = parseUazapiEvent(media);
    if (e.kind === "message") expect(e.messageType).toBe("image");
  });
  it("messages_update real (recibo whatsmeow): MessageIDs + state", () => {
    const e = parseUazapiEvent({
      EventType: "messages_update",
      type: "ReadReceipt",
      state: "Read",
      event: {
        Chat: "555198662662@s.whatsapp.net", chatid: "555198662662@s.whatsapp.net",
        Type: "Read", Sender: "555181899843@s.whatsapp.net", IsFromMe: true,
        Timestamp: 1783618042, MessageIDs: ["3AA0F9715FA2C18F5C94"],
      },
      owner: "555181899843", instanceName: "f360_11111111_7710c6c1",
      BaseUrl: "https://first360.uazapi.com",
    });
    expect(e).toEqual({ kind: "status", providerMessageId: "3AA0F9715FA2C18F5C94", status: "read" });
  });
});

