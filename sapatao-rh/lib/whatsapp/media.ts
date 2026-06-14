import { mimeToExt } from "./media-helpers";

export interface InboundMediaDeps {
  getMessage: (providerMessageId: string) => Promise<{ id: string; midia_url: string | null } | null>;
  download: (token: string, providerMessageId: string) => Promise<{ base64: string | null; mime: string | null }>;
  upload: (path: string, bytes: Uint8Array, mime: string) => Promise<{ error: { message?: string } | null }>;
  setMedia: (messageId: string, fields: { midia_url: string; midia_mime: string }) => Promise<{ error: { message?: string } | null }>;
}

export async function downloadAndStoreInbound(
  input: { empresaId: string; providerMessageId: string; token: string },
  deps: InboundMediaDeps,
): Promise<{ stored: boolean; reason?: string }> {
  const msg = await deps.getMessage(input.providerMessageId);
  if (!msg) return { stored: false, reason: "no_message" };
  if (msg.midia_url) return { stored: false, reason: "already" }; // idempotent on redelivery

  const { base64, mime } = await deps.download(input.token, input.providerMessageId);
  if (!base64) return { stored: false, reason: "empty" };

  const finalMime = mime ?? "application/octet-stream";
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const path = `${input.empresaId}/${input.providerMessageId}.${mimeToExt(finalMime)}`;

  const up = await deps.upload(path, bytes, finalMime);
  if (up.error) return { stored: false, reason: "upload_error" };

  const set = await deps.setMedia(msg.id, { midia_url: path, midia_mime: finalMime });
  if (set.error) { console.error(set.error.message); return { stored: false, reason: "set_error" }; }
  return { stored: true };
}
