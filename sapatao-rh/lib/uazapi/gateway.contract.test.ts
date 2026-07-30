// @vitest-environment node
// Contrato client ↔ gateway: sobe um UAZAPI falso (node:http) com respostas da spec
// e chama o client com fetch REAL (sem mock). Valida paths, headers e bodies.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createInstance, connectInstance, instanceStatus, disconnectInstance,
  registerWebhook, sendText, sendMedia, downloadMedia, markChatRead,
} from "./client";

type Recorded = { method: string; path: string; headers: Record<string, unknown>; body: unknown };
const recorded: Recorded[] = [];
let server: Server;
let base: string;

const ROUTES: Record<string, unknown> = {
  // Path documentado. Servidores antigos expõem /instance/create — coberto em client.test.ts.
  "POST /instance/init": {
    token: "tok-inst", instance: { id: "r1x", name: "sapatao-t", status: "disconnected" },
  },
  "POST /instance/connect": {
    connected: false, loggedIn: false,
    instance: { id: "r1x", status: "connecting", qrcode: "data:image/png;base64,QR1" },
  },
  "GET /instance/status": {
    instance: { id: "r1x", status: "connecting", qrcode: "data:image/png;base64,QR2", paircode: "12-34" },
    status: { connected: false, loggedIn: false },
  },
  "POST /instance/disconnect": { response: "ok" },
  "POST /webhook": { id: "wh1", enabled: true },
  "POST /send/text": { messageid: "3EB0AAA" },
  "POST /send/media": { messageid: "3EB0BBB" },
  "POST /message/download": { fileURL: "http://x/f.pdf", mimetype: "application/pdf", base64Data: "JVBERi0=" },
  "POST /chat/read": { response: "ok" },
};

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      recorded.push({
        method: req.method ?? "", path,
        headers: req.headers as Record<string, unknown>,
        body: raw ? JSON.parse(raw) : null,
      });
      const hit = ROUTES[`${req.method} ${path}`];
      res.writeHead(hit ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(hit ?? { error: "not found" }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("contrato client ↔ gateway UAZAPI (spec fixtures)", () => {
  it("ciclo de instância: create → connect → status → disconnect", async () => {
    const created = await createInstance(base, "admin-tok", "sapatao-t");
    expect(created).toEqual({ instanceId: "r1x", token: "tok-inst" });

    const conn = await connectInstance(base, "tok-inst");
    expect(conn.qr).toBe("data:image/png;base64,QR1");

    const st = await instanceStatus(base, "tok-inst");
    expect(st).toEqual({ status: "connecting", qr: "data:image/png;base64,QR2", paircode: "12-34" });

    await disconnectInstance(base, "tok-inst");

    expect(recorded[0].headers.admintoken).toBe("admin-tok");
    expect(recorded[1].headers.token).toBe("tok-inst");
  });

  it("webhook simple-mode com anti-loop", async () => {
    await registerWebhook(base, "tok-inst", "https://tunel.example/api/whatsapp/webhook/r1x?secret=s");
    const call = recorded.find((r) => r.path === "/webhook");
    expect(call?.body).toEqual({
      enabled: true,
      url: "https://tunel.example/api/whatsapp/webhook/r1x?secret=s",
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["wasSentByApi"],
    });
  });

  it("envio de texto e mídia devolve providerId", async () => {
    const t = await sendText(base, "tok-inst", "5551999000001", "olá!");
    expect(t.providerId).toBe("3EB0AAA");
    const m = await sendMedia(base, "tok-inst", "5551999000001", {
      type: "document", fileBase64: "AAA=", mimetype: "application/pdf", docName: "cv.pdf",
    });
    expect(m.providerId).toBe("3EB0BBB");
  });

  it("download de mídia usa base64Data e chat/read usa JID", async () => {
    const d = await downloadMedia(base, "tok-inst", "3EB0CCC");
    expect(d).toEqual({ base64: "JVBERi0=", mime: "application/pdf" });
    await markChatRead(base, "tok-inst", "5551999000001");
    const call = recorded.filter((r) => r.path === "/chat/read").at(-1);
    expect((call?.body as { number: string }).number).toBe("5551999000001@s.whatsapp.net");
  });
});
