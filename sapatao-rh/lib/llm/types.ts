/** A pluggable LLM provider. The CV pipeline depends on this interface only,
 *  so the mock (now) and a real provider (later, via env) are interchangeable. */
export interface LlmProvider {
  readonly modelo: string;
  /** Returns the model's JSON text + an estimated token count. Throws on network/timeout. */
  completeJson(system: string, user: string): Promise<{ json: string; tokensEst: number }>;
}
