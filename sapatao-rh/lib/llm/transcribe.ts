import { LlmError } from "./types";
import { DEFAULT_TRANSCRIBE_MODEL } from "./modelos";
import { mimeToExt } from "@/lib/whatsapp/media-helpers";

const API_URL = "https://api.openai.com/v1/audio/transcriptions";
const DEFAULT_TIMEOUT_MS = 30_000;

/** Limite de upload da API de transcrição da OpenAI. */
export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

interface TranscribeCfg {
  apiKey: string;
  modelo?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/** Transcreve UM áudio via OpenAI. Throws LlmError (chave_invalida | ia_indisponivel). */
export async function transcreverAudio(
  cfg: TranscribeCfg,
  audio: { buffer: Buffer; mime: string },
): Promise<{ texto: string; tokens: number }> {
  if (audio.buffer.length > MAX_AUDIO_BYTES) {
    throw new LlmError("ia_indisponivel", "Áudio maior que o limite de 25MB da transcrição.");
  }
  const fetchImpl = cfg.fetchImpl ?? fetch;

  const form = new FormData();
  const filename = `audio.${mimeToExt(audio.mime)}`;
  form.append("file", new Blob([new Uint8Array(audio.buffer)], { type: audio.mime }), filename);
  form.append("model", cfg.modelo ?? DEFAULT_TRANSCRIBE_MODEL);
  form.append("response_format", "json");

  let res: Response;
  try {
    res = await fetchImpl(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.apiKey}` },
      body: form,
      signal: AbortSignal.timeout(cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (err) {
    throw new LlmError("ia_indisponivel", err instanceof Error ? err.message : "falha de rede");
  }

  if (res.status === 401 || res.status === 403) {
    throw new LlmError("chave_invalida", `OpenAI recusou a chave (HTTP ${res.status}).`);
  }
  if (!res.ok) {
    throw new LlmError("ia_indisponivel", `Transcrição falhou (HTTP ${res.status}).`);
  }

  let payload: { text?: unknown; usage?: { total_tokens?: unknown } };
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    throw new LlmError("ia_indisponivel", "Resposta da transcrição não é JSON.");
  }
  if (typeof payload.text !== "string") {
    throw new LlmError("ia_indisponivel", "Resposta da transcrição sem texto.");
  }
  const tokens = typeof payload.usage?.total_tokens === "number" ? payload.usage.total_tokens : 0;
  return { texto: payload.text, tokens };
}
