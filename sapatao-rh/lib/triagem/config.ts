// Config da triagem automática. Módulo NEUTRO (sem next/headers, sem supabase):
// é importado tanto pelo worker no servidor quanto pelo formulário no client.
import { z } from "zod";

export const triagemConfigSchema = z.object({
  /** Espera antes de responder: 3 mensagens seguidas viram UMA resposta. */
  debounce_seg: z.number().int().min(3).max(120).default(10),
  /** Depois disto a IA para e entrega para humano, mesmo sem concluir. */
  max_turnos: z.number().int().min(3).max(40).default(12),
  /** Teto duro de mensagens da IA por conversa — a rede de segurança. */
  teto_hora: z.number().int().min(1).max(30).default(6),
  teto_dia: z.number().int().min(1).max(100).default(20),
  /** Silêncio do candidato até caber o follow-up (único). */
  followup_horas: z.number().int().min(1).max(168).default(24),
  /** Janela em que a IA pode falar (hora local, 0-23). Fora disso, espera. */
  horario_inicio: z.number().int().min(0).max(23).default(8),
  horario_fim: z.number().int().min(1).max(24).default(20),
  /** null = usa o modelo geral da empresa. Triagem é conversa simples: cabe um
   *  modelo mais barato aqui e o caro só na análise final. */
  modelo_triagem: z.string().nullable().default(null),
  /** Perguntas de qualificação, na ordem. Vazio = usa o roteiro padrão. */
  roteiro: z.array(z.string()).max(15).default([]),
  /** Como a IA se apresenta. */
  apresentacao: z.string().max(300).default("o RH do posto"),
});

export type TriagemConfig = z.infer<typeof triagemConfigSchema>;

export const TRIAGEM_CONFIG_PADRAO: TriagemConfig = triagemConfigSchema.parse({});

export const ROTEIRO_PADRAO = [
  "Confirmar que a pessoa procura vaga e qual função interessa.",
  "Perguntar se já trabalhou com atendimento ao público e por quanto tempo.",
  "Perguntar a disponibilidade de horário (incluindo fim de semana).",
  "Perguntar como se desloca até a unidade.",
  "Pedir o currículo, se ainda não tiver sido enviado.",
];

/** Nunca lança: config corrompida no banco não pode derrubar o worker. */
export function parseTriagemConfig(raw: unknown): TriagemConfig {
  const r = triagemConfigSchema.safeParse(raw ?? {});
  return r.success ? r.data : TRIAGEM_CONFIG_PADRAO;
}

export function roteiroEfetivo(cfg: TriagemConfig): string[] {
  return cfg.roteiro.length > 0 ? cfg.roteiro : ROTEIRO_PADRAO;
}

/**
 * A IA só fala dentro da janela configurada. Robô mandando mensagem às 3h da
 * manhã é a diferença entre "atendimento" e "incômodo".
 *
 * `hora` é a hora local já resolvida pelo chamador (o servidor pode estar em UTC).
 */
export function dentroDoHorario(hora: number, cfg: TriagemConfig): boolean {
  const { horario_inicio: ini, horario_fim: fim } = cfg;
  // Janela que cruza a meia-noite (ex.: 22 → 6) continua válida.
  return ini <= fim ? hora >= ini && hora < fim : hora >= ini || hora < fim;
}

/** Hora local de São Paulo, independente do fuso do servidor. */
export function horaLocalBr(agora: Date): number {
  const fmt = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "numeric",
    hour12: false,
  });
  return Number(fmt.format(agora));
}
