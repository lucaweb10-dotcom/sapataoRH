/** Attachment forwarded to a multimodal provider (image or PDF, base64-encoded). */
export type LlmAnexo = {
  kind: "image" | "pdf";
  mime: string;
  base64: string;
  nome?: string;
};

export interface LlmJsonOpts {
  anexos?: LlmAnexo[];
  /** Strict JSON Schema for structured outputs (Responses API text.format). Ignored by the mock. */
  jsonSchema?: { name: string; schema: Record<string, unknown> };
  timeoutMs?: number;
}

/** A pluggable LLM provider. The analysis pipelines depend on this interface only,
 *  so the mock and the real OpenAI provider are interchangeable. */
export interface LlmProvider {
  readonly modelo: string;
  /** Returns the model's JSON text + token usage. Throws LlmError on API failure. */
  completeJson(
    system: string,
    user: string,
    opts?: LlmJsonOpts,
  ): Promise<{ json: string; tokensEst: number; tokensIn?: number; tokensOut?: number }>;
}

export type LlmErrorCode = "chave_invalida" | "ia_indisponivel";

/** Typed provider failure: 401/403 → chave_invalida; timeout/5xx/rede → ia_indisponivel. */
export class LlmError extends Error {
  constructor(
    public readonly code: LlmErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "LlmError";
  }
}
