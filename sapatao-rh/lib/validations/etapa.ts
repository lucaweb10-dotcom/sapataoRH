import { z } from "zod";

export const etapaSchema = z
  .object({
    nome: z.string().min(1).max(60),
    cor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser hex (#RRGGBB)"),
    sla_dias: z.number().int().min(0).max(365).nullable(),
    is_terminal: z.boolean(),
    requires_confirm: z.boolean(),
    status_destino: z.enum(["contratado", "reprovado", "desistente"]).nullable(),
  })
  .refine((e) => (e.is_terminal ? e.status_destino !== null : e.status_destino === null), {
    message: "Etapa terminal exige status_destino; etapa não-terminal exige status_destino nulo.",
    path: ["status_destino"],
  });

export type EtapaInputDTO = z.infer<typeof etapaSchema>;
