// Contrato de UM turno da triagem.
//
// `mensagem` é UMA string, nunca uma lista: é assim que o modelo fica
// estruturalmente impedido de disparar várias mensagens de uma vez. `null`
// significa ficar calado, e é uma saída legítima.
import { z } from "zod";
import { toStrictJsonSchema } from "@/lib/llm/json-schema";
import { MAX_MENSAGEM_CHARS } from "./estilo";

export const ESTADOS_TRIAGEM = ["perguntando", "aguardando_cv", "concluida", "handoff"] as const;
export const INTENCOES = ["normal", "parar", "fora_do_escopo"] as const;

export const turnoSchema = z.object({
  /** A ÚNICA mensagem que sai deste turno. null = não responder agora. */
  mensagem: z.string().max(MAX_MENSAGEM_CHARS * 2).nullable(),
  proximo_estado: z.enum(ESTADOS_TRIAGEM),
  /** Campos do cadastro que a IA conseguiu extrair da conversa. */
  campos: z.object({
    vaga_interesse: z.string().nullable(),
    idade: z.number().int().min(14).max(99).nullable(),
    tem_veiculo: z.boolean().nullable(),
    endereco: z.string().nullable(),
    disponibilidade: z.string().nullable(),
    experiencia: z.string().nullable(),
  }),
  intencao: z.enum(INTENCOES),
  motivo_handoff: z.string().nullable(),
});

export type Turno = z.infer<typeof turnoSchema>;
export type CamposTriagem = Turno["campos"];

export const TURNO_JSON_SCHEMA = {
  name: "turno_triagem",
  schema: toStrictJsonSchema(turnoSchema),
};

/** Nunca lança: JSON inválido do modelo vira null e o chamador fica calado. */
export function parseTurno(jsonText: string): Turno | null {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const r = turnoSchema.safeParse(raw);
  return r.success ? r.data : null;
}

/** Campos não-nulos que valem gravar no candidato. */
export function camposParaCadastro(campos: CamposTriagem): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (campos.vaga_interesse) out.vaga_interesse = campos.vaga_interesse;
  if (campos.idade !== null) out.idade = campos.idade;
  if (campos.tem_veiculo !== null) out.tem_veiculo = campos.tem_veiculo;
  if (campos.endereco) out.endereco = campos.endereco;
  return out;
}
