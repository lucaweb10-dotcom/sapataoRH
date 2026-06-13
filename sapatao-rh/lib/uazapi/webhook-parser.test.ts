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
});
