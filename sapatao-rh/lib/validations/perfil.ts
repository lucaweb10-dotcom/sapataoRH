import { z } from "zod";

export const perfilAnalyzeSchema = z.object({
  conversationId: z.uuid(),
  // Cargo de avaliação explícito (opcional — sem ele, resolve pela vaga de interesse).
  cargoId: z.uuid().nullish(),
});
export type PerfilAnalyzeInputDTO = z.infer<typeof perfilAnalyzeSchema>;
