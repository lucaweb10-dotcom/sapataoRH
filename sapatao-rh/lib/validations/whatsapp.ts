import { z } from "zod";

export const webhookParamsSchema = z.object({
  instanceId: z.string().min(1, "instanceId é obrigatório"),
});

export const connectInputSchema = z.object({
  phone: z.string().optional(),
});

export type WebhookParams = z.infer<typeof webhookParamsSchema>;
export type ConnectInput = z.infer<typeof connectInputSchema>;
