import { LlmError, type LlmAnexo, type LlmJsonOpts, type LlmProvider } from "./types";

const API_URL = "https://api.openai.com/v1/responses";
const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 3072;

interface OpenAiProviderCfg {
  apiKey: string;
  modelo: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

type ContentPart =
  | { type: "input_text"; text: string }
  | { type: "input_image"; image_url: string; detail: "low" }
  | { type: "input_file"; filename: string; file_data: string };

function anexoToPart(anexo: LlmAnexo): ContentPart {
  if (anexo.kind === "image") {
    return { type: "input_image", image_url: `data:${anexo.mime};base64,${anexo.base64}`, detail: "low" };
  }
  return {
    type: "input_file",
    filename: anexo.nome ?? "documento.pdf",
    file_data: `data:${anexo.mime};base64,${anexo.base64}`,
  };
}

/** Extracts the assistant text from a Responses API payload. */
function extractOutputText(payload: Record<string, unknown>): string | null {
  const output = payload.output;
  if (!Array.isArray(output)) return null;
  for (const item of output) {
    if (!item || typeof item !== "object" || (item as { type?: string }).type !== "message") continue;
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part && typeof part === "object" && (part as { type?: string }).type === "output_text") {
        const text = (part as { text?: unknown }).text;
        if (typeof text === "string") return text;
      }
    }
  }
  return null;
}

/**
 * Real OpenAI provider over the Responses API (fetch puro — só 2 endpoints no projeto,
 * mesmo racional do client UAZAPI). Structured outputs via text.format json_schema
 * strict; anexos multimodais (imagem/PDF) como input_image/input_file.
 */
export function createOpenAiProvider(cfg: OpenAiProviderCfg): LlmProvider {
  const fetchImpl = cfg.fetchImpl ?? fetch;
  const timeoutMs = cfg.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function callOnce(body: string, timeout: number): Promise<Response> {
    return fetchImpl(API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body,
      signal: AbortSignal.timeout(timeout),
    });
  }

  return {
    modelo: cfg.modelo,
    async completeJson(system, user, opts?: LlmJsonOpts) {
      const userContent: ContentPart[] = [{ type: "input_text", text: user }];
      for (const anexo of opts?.anexos ?? []) userContent.push(anexoToPart(anexo));

      const body = JSON.stringify({
        model: cfg.modelo,
        input: [
          { role: "system", content: [{ type: "input_text", text: system }] },
          { role: "user", content: userContent },
        ],
        max_output_tokens: MAX_OUTPUT_TOKENS,
        ...(opts?.jsonSchema
          ? {
              text: {
                format: {
                  type: "json_schema",
                  name: opts.jsonSchema.name,
                  strict: true,
                  schema: opts.jsonSchema.schema,
                },
              },
            }
          : {}),
      });

      const timeout = opts?.timeoutMs ?? timeoutMs;
      // No máximo 2 chamadas: 1 retry para 5xx/rede/timeout; 4xx nunca se repete.
      let res: Response;
      let retried = false;
      try {
        res = await callOnce(body, timeout);
      } catch (err) {
        retried = true;
        await new Promise((r) => setTimeout(r, 500));
        try {
          res = await callOnce(body, timeout);
        } catch {
          throw new LlmError("ia_indisponivel", err instanceof Error ? err.message : "falha de rede");
        }
      }
      if (res.status >= 500 && !retried) {
        await new Promise((r) => setTimeout(r, 500));
        try {
          res = await callOnce(body, timeout);
        } catch {
          throw new LlmError("ia_indisponivel", "falha de rede no retry");
        }
      }

      if (res.status === 401 || res.status === 403) {
        throw new LlmError("chave_invalida", `OpenAI recusou a chave (HTTP ${res.status}).`);
      }
      if (!res.ok) {
        throw new LlmError("ia_indisponivel", `OpenAI HTTP ${res.status}.`);
      }

      let payload: Record<string, unknown>;
      try {
        payload = (await res.json()) as Record<string, unknown>;
      } catch {
        throw new LlmError("ia_indisponivel", "Resposta da OpenAI não é JSON.");
      }

      const text = extractOutputText(payload);
      if (text === null) {
        throw new LlmError("ia_indisponivel", "Resposta da OpenAI sem texto de saída.");
      }

      const usage = (payload.usage ?? {}) as Record<string, unknown>;
      const tokensIn = typeof usage.input_tokens === "number" ? usage.input_tokens : undefined;
      const tokensOut = typeof usage.output_tokens === "number" ? usage.output_tokens : undefined;
      const tokensEst =
        typeof usage.total_tokens === "number"
          ? usage.total_tokens
          : Math.max(1, Math.ceil((system.length + user.length) / 4));

      return { json: text, tokensEst, tokensIn, tokensOut };
    },
  };
}
