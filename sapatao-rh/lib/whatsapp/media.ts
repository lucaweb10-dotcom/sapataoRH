import { mimeToExt } from "./media-helpers";

export interface InboundMediaDeps {
  getMessage: (providerMessageId: string) => Promise<{ id: string; midia_url: string | null } | null>;
  download: (token: string, providerMessageId: string) => Promise<{ base64: string | null; mime: string | null }>;
  upload: (path: string, bytes: Uint8Array, mime: string) => Promise<{ error: { message?: string } | null }>;
  setMedia: (messageId: string, fields: { midia_url: string; midia_mime: string }) => Promise<{ error: { message?: string } | null }>;
  /** Injetável para teste; padrão é setTimeout real. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Backoff do download. O binário NÃO vem no webhook — só o id, e a mídia
 * expira no provedor em ~2 dias, então uma falha transitória sem retry vira
 * "Mídia indisponível" permanente para o usuário. Três tentativas cobrem o
 * caso comum (5xx/timeout momentâneo do provedor) sem segurar recurso à toa.
 */
export const MEDIA_RETRY_DELAYS_MS = [1_000, 5_000];

const espera = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function downloadAndStoreInbound(
  input: { empresaId: string; providerMessageId: string; token: string },
  deps: InboundMediaDeps,
): Promise<{ stored: boolean; reason?: string; attempts?: number }> {
  const msg = await deps.getMessage(input.providerMessageId);
  if (!msg) return { stored: false, reason: "no_message" };
  if (msg.midia_url) return { stored: false, reason: "already" }; // idempotent on redelivery

  const sleep = deps.sleep ?? espera;
  const totalTentativas = MEDIA_RETRY_DELAYS_MS.length + 1;

  let base64: string | null = null;
  let mime: string | null = null;
  let tentativas = 0;

  for (let i = 0; i < totalTentativas; i++) {
    tentativas = i + 1;
    try {
      const r = await deps.download(input.token, input.providerMessageId);
      if (r.base64) {
        base64 = r.base64;
        mime = r.mime;
        break;
      }
    } catch (err) {
      // Última tentativa: deixa registrado o motivo real antes de desistir.
      if (i === totalTentativas - 1) {
        console.error(
          `download de mídia falhou após ${tentativas} tentativas (${input.providerMessageId}):`,
          err instanceof Error ? err.message : err,
        );
      }
    }
    if (i < MEDIA_RETRY_DELAYS_MS.length) await sleep(MEDIA_RETRY_DELAYS_MS[i]);
  }

  if (!base64) return { stored: false, reason: "empty", attempts: tentativas };

  const finalMime = mime ?? "application/octet-stream";
  const bytes = Uint8Array.from(Buffer.from(base64, "base64"));
  const path = `${input.empresaId}/${input.providerMessageId}.${mimeToExt(finalMime)}`;

  const up = await deps.upload(path, bytes, finalMime);
  if (up.error) return { stored: false, reason: "upload_error", attempts: tentativas };

  const set = await deps.setMedia(msg.id, { midia_url: path, midia_mime: finalMime });
  if (set.error) { console.error(set.error.message); return { stored: false, reason: "set_error", attempts: tentativas }; }
  return { stored: true, attempts: tentativas };
}
