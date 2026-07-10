import { z } from "zod";
import { MODELOS_OPENAI } from "@/lib/llm/modelos";

const MODELOS_VALIDOS = MODELOS_OPENAI.map((m) => m.value) as [string, ...string[]];

/** Integração OpenAI (Config > IA). apiKey null = manter a já salva. */
export const integracaoIaSchema = z.object({
  apiKey: z.string().trim().min(20, "Chave muito curta").nullable(),
  modelo: z.enum(MODELOS_VALIDOS),
  limiteTokensMes: z
    .number()
    .int()
    .positive()
    .max(1_000_000_000)
    .nullable(), // null = sem limite
});
export type IntegracaoIaDTO = z.infer<typeof integracaoIaSchema>;

/** Nome de um cargo de avaliação. */
export const cargoNomeSchema = z.string().trim().min(2, "Nome muito curto").max(60);
