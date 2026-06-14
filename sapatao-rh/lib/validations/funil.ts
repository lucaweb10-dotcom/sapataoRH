import { z } from "zod";

export const moverSchema = z.object({
  candidatoId: z.uuid(),
  paraEtapaId: z.uuid(),
  observacao: z.string().max(2000).optional(),
});
export type MoverInputDTO = z.infer<typeof moverSchema>;

export const notasSchema = z.object({
  candidatoId: z.uuid(),
  notas: z.string().max(5000),
});
export type NotasInputDTO = z.infer<typeof notasSchema>;
