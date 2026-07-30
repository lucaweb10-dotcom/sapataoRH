import { z } from "zod";
import { toStrictJsonSchema } from "@/lib/llm/json-schema";

/** De onde saiu a evidência. Fontes diferentes têm confiabilidade diferente e o
 *  gestor precisa ver isso — o que o candidato diz no WhatsApp não vale o mesmo
 *  que o que está escrito no currículo. */
export const FONTES = ["conversa", "curriculo", "cadastro", "nao_consta"] as const;
export type Fonte = (typeof FONTES)[number];

export const FONTE_ROTULO: Record<Fonte, string> = {
  conversa: "disse na conversa",
  curriculo: "no currículo",
  cadastro: "no cadastro",
  nao_consta: "não consta",
};

/**
 * Structured CV analysis returned by the LLM (mirrors PRD §7.5).
 *
 * `fonte` e `contradicoes` são opcionais no zod DE PROPÓSITO: pareceres gravados
 * antes da SP8 não os têm e precisam continuar carregando. O JSON Schema mandado
 * ao provedor marca tudo como required (toStrictJsonSchema), então a saída NOVA
 * sempre vem completa.
 */
export const parecerSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["apto", "atencao", "inapto"]),
  criterios_atendidos: z
    .array(
      z.object({
        criterio: z.string(),
        atendido: z.boolean(),
        evidencia: z.string(),
        fonte: z.enum(FONTES).optional(),
      }),
    )
    .max(20),
  pontos_fortes: z.array(z.string()).max(10),
  pontos_atencao: z.array(z.string()).max(10),
  experiencia_relevante: z.string(),
  resumo: z.string(),
  perguntas_sugeridas_entrevista: z.array(z.string()).max(10),
  /** Divergências entre o que o candidato disse, o currículo e o cadastro. */
  contradicoes: z
    .array(
      z.object({
        tema: z.string(),
        na_conversa: z.string(),
        em_outra_fonte: z.string(),
      }),
    )
    .max(10)
    .optional(),
});

export type Parecer = z.infer<typeof parecerSchema>;

/** Strict JSON Schema do parecer p/ structured outputs da Responses API. */
export const PARECER_JSON_SCHEMA = {
  name: "parecer",
  schema: toStrictJsonSchema(parecerSchema),
};

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
