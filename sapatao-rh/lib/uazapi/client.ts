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

function baseUrl(): string {
  const url = process.env.UAZAPI_API_URL;
  if (!url) throw new Error("UAZAPI_API_URL is not set");
  return url.replace(/\/$/, "");
}

async function apiFetch(
  path: string,
  options: RequestInit & { headers?: Record<string, string> },
): Promise<unknown> {
  const url = `${baseUrl()}${path}`;
  const res = await fetch(url, options);
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

/** Create a new UAZAPI instance. Uses admintoken header (no Bearer). */
export async function createInstance(
  adminToken: string,
  name: string,
): Promise<{ instanceId: string; token: string }> {
  const body = (await apiFetch("/instance/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", admintoken: adminToken },
    body: JSON.stringify({ name }),
  })) as Record<string, unknown>;

  const instanceId =
    (body["instanceId"] as string | undefined) ??
    (body["instance"] as string | undefined) ??
    (body["id"] as string | undefined) ??
    "";
  const token =
    (body["token"] as string | undefined) ?? (body["apitoken"] as string | undefined) ?? "";

  return { instanceId, token };
}

/** Connect an instance (start QR flow). Returns the QR string if available. */
export async function connectInstance(
  token: string,
  phone?: string,
): Promise<{ qr: string | null }> {
  const body = await apiFetch("/instance/connect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify(phone ? { phone } : {}),
  });
  return { qr: extractQr(body) };
}

/** Get the current status of an instance. */
export async function instanceStatus(token: string): Promise<{ status: string }> {
  const body = (await apiFetch("/instance/status", {
    method: "GET",
    headers: { token },
  })) as Record<string, unknown>;

  const status =
    (body["state"] as string | undefined) ??
    (body["status"] as string | undefined) ??
    "unknown";
  return { status };
}

/** Disconnect (logout) an instance. */
export async function disconnectInstance(token: string): Promise<void> {
  await apiFetch("/instance/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({}),
  });
}

/** Register a webhook URL for an instance. Path per the UAZAPI OpenAPI (validate live). */
export async function registerWebhook(token: string, url: string): Promise<void> {
  await apiFetch("/webhook", {
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
  token: string,
  number: string,
  text: string,
  replyId?: string,
): Promise<{ providerId: string | null }> {
  const body = await apiFetch("/send/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(replyId ? { number, text, replyid: replyId } : { number, text }),
  });
  return { providerId: extractMessageId(body) };
}

/** Mark a chat as read (zeroes the badge on the connected phone). Best-effort. */
export async function markChatRead(token: string, number: string): Promise<void> {
  await apiFetch("/chat/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number, read: true }),
  });
}

/** Download received media (the v2 webhook carries only the id). Returns base64 + mime. */
export async function downloadMedia(
  token: string,
  providerMessageId: string,
): Promise<{ base64: string | null; mime: string | null }> {
  const body = (await apiFetch("/message/download", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ id: providerMessageId, return_base64: true, return_link: false }),
  })) as Record<string, unknown>;
  const base64 =
    (body["base64"] as string | undefined) ??
    (body["data"] as string | undefined) ??
    (body["file"] as string | undefined) ??
    null;
  const mime =
    (body["mimetype"] as string | undefined) ?? (body["mime"] as string | undefined) ?? null;
  return { base64, mime };
}

/** Send media. Caption goes in `text` (NOT `caption`); docName only for documents. */
export async function sendMedia(
  token: string,
  number: string,
  args: { type: "image" | "video" | "audio" | "ptt" | "document"; fileBase64: string; mimetype: string; docName?: string; caption?: string },
): Promise<{ providerId: string | null }> {
  const body = await apiFetch("/send/media", {
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
