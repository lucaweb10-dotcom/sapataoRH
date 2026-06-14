import { z } from "zod";

export const analyzeSchema = z.object({
  messageId: z.uuid(),
});
export type AnalyzeInputDTO = z.infer<typeof analyzeSchema>;
