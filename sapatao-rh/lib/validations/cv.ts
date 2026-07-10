import { z } from "zod";

export const analyzeSchema = z.object({
  messageId: z.uuid(),
  // SP3b: cargo de avaliação explícito (opcional — sem ele, resolve pela vaga de interesse)
  cargoId: z.uuid().nullish(),
});
export type AnalyzeInputDTO = z.infer<typeof analyzeSchema>;
