import { z } from "zod";

export const unidadeSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(80),
  cidade: z
    .string()
    .trim()
    .max(120)
    .transform((v) => v || null)
    .nullable(),
  endereco: z
    .string()
    .trim()
    .max(200)
    .transform((v) => v || null)
    .nullable(),
});
export type UnidadeInputDTO = z.input<typeof unidadeSchema>;
