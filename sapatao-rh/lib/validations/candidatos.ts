import { z } from "zod";

export const ORIGENS = ["indicacao", "presencial", "site", "whatsapp", "outro"] as const;
export type Origem = (typeof ORIGENS)[number];

const telefoneNormalizado = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((d) => d.length >= 10 && d.length <= 15, {
    message: "Telefone deve ter 10 a 15 dígitos (com DDD).",
  });

const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);

export const criarCandidatoSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  telefone: telefoneNormalizado,
  vaga_interesse: z.string().trim().min(1).max(80).nullable().default(null),
  unidade_id: z.uuid().nullable().default(null),
  origem: z.enum(ORIGENS).default("outro"),
  tags: tagsSchema.default([]),
});
export type CriarCandidatoInput = z.input<typeof criarCandidatoSchema>;

export const atualizarCandidatoSchema = z
  .object({
    nome: z.string().trim().min(2, "Nome muito curto").max(120),
    idade: z.number().int().min(14).max(99).nullable(),
    cep: z.string().trim().max(9).nullable(),
    endereco: z.string().trim().max(200).nullable(),
    tem_veiculo: z.boolean().nullable(),
    vaga_interesse: z.string().trim().max(80).nullable(),
    tags: tagsSchema,
    atribuido_a: z.uuid().nullable(),
    telefone: telefoneNormalizado,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para atualizar" });
export type AtualizarCandidatoInput = z.input<typeof atualizarCandidatoSchema>;
