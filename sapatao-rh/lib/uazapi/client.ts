import { extractQr, extractMessageId } from "./extract";

export class UazapiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `UAZAPI error ${status}`);
    this.name = "UazapiError";
  }
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

/** Teto para qualquer chamada ao provedor. Sem isto uma conexão pendurada deixa
 *  a bolha em "enviando" para sempre — nem vira `failed`, então o usuário não
 *  ganha nem o botão de reenviar. */
export const UAZAPI_TIMEOUT_MS = 30_000;

async function apiFetch(
  baseUrl: string,
  path: string,
  options: RequestInit & { headers?: Record<string, string> },
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: options.signal ?? AbortSignal.timeout(UAZAPI_TIMEOUT_MS),
    });
  } catch (err) {
    // AbortSignal.timeout rejeita com TimeoutError; normalizamos para 504 de
    // modo que quem chama trate como falha de provedor, não como bug interno.
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new UazapiError(504, null, `UAZAPI timeout após ${UAZAPI_TIMEOUT_MS}ms em ${path}`);
    }
    throw err;
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new UazapiError(res.status, body);
  }
  return body;
}

/** Create a new UAZAPI instance. Uses admintoken header (no Bearer).
 *  O path documentado é POST /instance/init (docs.uazapi.com/endpoint/post/instance~init);
 *  /instance/create responde o mesmo em servidores mais antigos. Tentamos o
 *  documentado e só caímos no legado em 404, porque a versão do servidor varia.
 *  Real response shape: { token, instance: { id, ... } } (instance is an OBJECT). */
export async function createInstance(
  baseUrl: string,
  adminToken: string,
  name: string,
): Promise<{ instanceId: string; token: string }> {
  const call = (path: string) =>
    apiFetch(baseUrl, path, {
      method: "POST",
      headers: { "Content-Type": "application/json", admintoken: adminToken },
      body: JSON.stringify({ name }),
    });

  let raw: unknown;
  try {
    raw = await call("/instance/init");
  } catch (err) {
    if (err instanceof UazapiError && err.status === 404) raw = await call("/instance/create");
    else throw err;
  }

  const body = asObj(raw);
  const instance = asObj(body["instance"]);
  const instanceId =
    str(instance["id"]) ?? str(body["instanceId"]) ?? str(body["id"]) ?? "";
  const token = str(body["token"]) ?? str(instance["token"]) ?? "";
  return { instanceId, token };
}

/** Connect an instance (start QR flow). Returns the QR string if available. */
export async function connectInstance(
  baseUrl: string,
  token: string,
  phone?: string,
): Promise<{ qr: string | null }> {
  const body = await apiFetch(baseUrl, "/instance/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(phone ? { phone } : {}),
  });
  return { qr: extractQr(body) };
}

/** Instance status. Real response: { instance: {status, qrcode, paircode}, status: {connected, loggedIn} }.
 *  The QR is REFRESHED on every call while connecting — callers should re-render it. */
export async function instanceStatus(
  baseUrl: string,
  token: string,
): Promise<{ status: string; qr: string | null; paircode: string | null }> {
  const body = asObj(
    await apiFetch(baseUrl, "/instance/status", { method: "GET", headers: { token } }),
  );
  const instance = asObj(body["instance"]);
  const statusObj = asObj(body["status"]);
  const status =
    str(instance["status"]) ??
    (statusObj["connected"] === true || statusObj["loggedIn"] === true
      ? "connected"
      : str(body["state"]) ?? "disconnected");
  return {
    status,
    qr: extractQr(body),
    paircode: str(instance["paircode"]),
  };
}

/** Disconnect (logout) an instance. */
export async function disconnectInstance(baseUrl: string, token: string): Promise<void> {
  await apiFetch(baseUrl, "/instance/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({}),
  });
}

/** Register/update the single webhook (UAZAPI "simple mode" — no action/id). Idempotent. */
export async function registerWebhook(
  baseUrl: string,
  token: string,
  url: string,
): Promise<void> {
  await apiFetch(baseUrl, "/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      enabled: true,
      url,
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["wasSentByApi"],
    }),
  });
}

/** Send a text message. Returns the provider message id (tolerant extraction). */
export async function sendText(
  baseUrl: string,
  token: string,
  number: string,
  text: string,
  replyId?: string,
): Promise<{ providerId: string | null }> {
  const body = await apiFetch(baseUrl, "/send/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(replyId ? { number, text, replyid: replyId } : { number, text }),
  });
  return { providerId: extractMessageId(body) };
}

/** Mark a chat as read. Spec wants a JID (5511...@s.whatsapp.net). Best-effort. */
export async function markChatRead(
  baseUrl: string,
  token: string,
  number: string,
): Promise<void> {
  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
  await apiFetch(baseUrl, "/chat/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number: jid, read: true }),
  });
}

/** Download received media. Real response field is `base64Data` (+ mimetype). */
export async function downloadMedia(
  baseUrl: string,
  token: string,
  providerMessageId: string,
): Promise<{ base64: string | null; mime: string | null }> {
  const body = asObj(
    await apiFetch(baseUrl, "/message/download", {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ id: providerMessageId, return_base64: true, return_link: false }),
    }),
  );
  const base64 =
    str(body["base64Data"]) ?? str(body["base64"]) ?? str(body["data"]) ?? str(body["file"]);
  const mime = str(body["mimetype"]) ?? str(body["mime"]);
  return { base64, mime };
}

/**
 * Busca mensagens de um chat para reconciliar o ack.
 *
 * Existe porque a UAZAPI NÃO empurra `messages_update` para mensagens que a
 * própria API enviou — sem isto o ✓✓ nunca sai de "enviado". A doc posiciona
 * `/message/find` justamente como a saída "quando o webhook não chega".
 *
 * Extração tolerante: a resposta pode vir como array puro ou embrulhada em
 * `messages`/`data`, e o status pode estar em `status` ou `ack`.
 */
export async function findMessages(
  baseUrl: string,
  token: string,
  filtro: { chatid: string; limit?: number },
): Promise<{ providerId: string; status: string }[]> {
  const body = await apiFetch(baseUrl, "/message/find", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ chatid: filtro.chatid, limit: filtro.limit ?? 100 }),
  });

  const lista: unknown[] = Array.isArray(body)
    ? body
    : Array.isArray(asObj(body)["messages"])
      ? (asObj(body)["messages"] as unknown[])
      : Array.isArray(asObj(body)["data"])
        ? (asObj(body)["data"] as unknown[])
        : [];

  const out: { providerId: string; status: string }[] = [];
  for (const item of lista) {
    const m = asObj(item);
    const providerId = extractMessageId(m);
    const status = str(m["status"]) ?? str(m["ack"]) ?? null;
    if (providerId && status) out.push({ providerId, status });
  }
  return out;
}

/** Send media. Caption goes in `text` (NOT `caption`); docName only for documents. */
export async function sendMedia(
  baseUrl: string,
  token: string,
  number: string,
  args: { type: "image" | "video" | "audio" | "ptt" | "document"; fileBase64: string; mimetype: string; docName?: string; caption?: string },
): Promise<{ providerId: string | null }> {
  const body = await apiFetch(baseUrl, "/send/media", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      number,
      type: args.type,
      file: args.fileBase64,
      mimetype: args.mimetype,
      ...(args.docName ? { docName: args.docName } : {}),
      ...(args.caption ? { text: args.caption } : {}),
    }),
  });
  return { providerId: extractMessageId(body) };
}
