import { z } from "zod";

/** Sugestões de categoria (o campo é texto livre; "saudacao" é usada no prefill). */
export const CATEGORIAS_TEMPLATE = ["saudacao", "follow_up", "entrevista", "outro"] as const;

export const templateSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(80),
  categoria: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,40}$/, "Categoria: minúsculas, números, _ ou - (sem espaços)"),
  conteudo: z.string().trim().min(1, "Conteúdo obrigatório").max(2000),
  ativo: z.boolean(),
});
export type TemplateInputDTO = z.infer<typeof templateSchema>;
