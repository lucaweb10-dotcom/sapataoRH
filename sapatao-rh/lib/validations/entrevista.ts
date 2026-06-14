import { z } from "zod";

export const entrevistaSchema = z.object({
  data_hora: z.string().min(1, "Data e hora obrigatórias"),
  formato: z.enum(["presencial", "online"]),
  local_ou_link: z.string().max(255).nullable().optional(),
  observacoes: z.string().max(1000).nullable().optional(),
});

export type EntrevistaInput = z.infer<typeof entrevistaSchema>;
