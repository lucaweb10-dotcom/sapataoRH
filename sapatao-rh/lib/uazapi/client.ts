import { extractQr } from "./extract";

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
