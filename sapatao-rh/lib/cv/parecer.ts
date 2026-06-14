import { z } from "zod";

/** Structured CV analysis returned by the LLM (mirrors PRD §7.5). */
export const parecerSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["apto", "atencao", "inapto"]),
  criterios_atendidos: z
    .array(
      z.object({
        criterio: z.string(),
        atendido: z.boolean(),
        evidencia: z.string(),
      }),
    )
    .max(20),
  pontos_fortes: z.array(z.string()).max(10),
  pontos_atencao: z.array(z.string()).max(10),
  experiencia_relevante: z.string(),
  resumo: z.string(),
  perguntas_sugeridas_entrevista: z.array(z.string()).max(10),
});

export type Parecer = z.infer<typeof parecerSchema>;

/** Parses + validates the LLM's JSON text. Returns null on any parse/schema failure. */
export function parseParecer(jsonText: string): Parecer | null {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const r = parecerSchema.safeParse(raw);
  return r.success ? r.data : null;
}
