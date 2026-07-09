import { z } from "zod";

export const webhookParamsSchema = z.object({
  instanceId: z.string().min(1, "instanceId é obrigatório"),
});

export const connectInputSchema = z.object({
  phone: z.string().optional(),
});

export type WebhookParams = z.infer<typeof webhookParamsSchema>;
export type ConnectInput = z.infer<typeof connectInputSchema>;

export const sendMessageSchema = z.object({
  conversationId: z.uuid(),
  texto: z.string().min(1, "Mensagem vazia"),
  clientMessageId: z.uuid(),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

export const sendMediaSchema = z.object({
  conversationId: z.uuid(),
  clientMessageId: z.uuid(),
  fileBase64: z.string().min(1),
  mime: z.string().min(1),
  fileName: z.string().optional(),
  caption: z.string().optional(),
});
export type SendMediaInputDTO = z.infer<typeof sendMediaSchema>;

const urlLimpa = z
  .string()
  .trim()
  .pipe(z.url({ error: "URL inválida" }))
  .transform((u) => u.replace(/\/+$/, ""));

export const credenciaisUazapiSchema = z.object({
  baseUrl: urlLimpa,
  // null = manter o admin token já salvo (update parcial)
  adminToken: z.string().trim().min(8, "Token muito curto").nullable(),
});
export type CredenciaisUazapiInput = z.infer<typeof credenciaisUazapiSchema>;

export const webhookPublicoSchema = z.object({ url: urlLimpa });
export type WebhookPublicoInput = z.infer<typeof webhookPublicoSchema>;
