import { z } from "zod";
import { MAX_PERGUNTA_CHARS } from "@/lib/copiloto/chat";

export const copilotoPerguntaSchema = z.object({
  candidatoId: z.uuid(),
  pergunta: z.string().trim().min(1).max(MAX_PERGUNTA_CHARS),
});

export type CopilotoPerguntaInput = z.infer<typeof copilotoPerguntaSchema>;
