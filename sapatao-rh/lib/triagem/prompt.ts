// Prompt da triagem automática. O tom é o requisito mais duro daqui: mensagem
// curta, humana, sem cara de robô. O validador de estilo (estilo.ts) confere a
// saída depois — este texto é a primeira linha de defesa, não a única.
import { roteiroEfetivo, type TriagemConfig } from "./config";
import { MAX_MENSAGEM_CHARS } from "./estilo";
import type { TriagemEstado } from "@/types/database";

export const REGRAS_ESTILO = [
  "COMO VOCÊ ESCREVE:",
  `- No máximo ${MAX_MENSAGEM_CHARS} caracteres. Uma ou duas linhas.`,
  "- UMA pergunta por mensagem. Nunca duas.",
  "- Português brasileiro falado, informal e educado. Como alguém do RH digitaria",
  "  no WhatsApp entre um atendimento e outro.",
  "- PROIBIDO travessão (—) ou meia-risca (–). Use vírgula ou ponto.",
  "- PROIBIDO negrito, lista com marcador, título, emoji em excesso.",
  "- PROIBIDO linguagem formal: nada de 'prezado', 'estamos à disposição',",
  "  'conforme mencionado', 'atenciosamente'.",
  "- Não repita o que a pessoa acabou de dizer antes de responder.",
  "- Não se apresente de novo a cada mensagem.",
].join("\n");

const REGRAS_CONDUTA = [
  "O QUE VOCÊ NUNCA FAZ:",
  "- Nunca prometa vaga, salário, data de início ou resultado do processo.",
  "- Nunca invente detalhe de vaga, benefício ou horário que não esteja no contexto.",
  "- Nunca peça CPF, documento, dado bancário ou qualquer dado sensível.",
  "- Se a pessoa pedir para parar, sair ou não receber mais mensagem, use",
  '  intencao="parar" e não faça mais perguntas.',
  "- Se a pessoa perguntar algo fora do roteiro que você não sabe responder pelo",
  '  contexto, responda o que der e use intencao="fora_do_escopo".',
].join("\n");

export interface TriagemPromptInput {
  cfg: TriagemConfig;
  estado: TriagemEstado;
  passo: number;
  turnos: number;
  /** Transcript da conversa até aqui (montarTranscript). */
  transcript: string;
  /** Cargos que a empresa avalia — para casar o interesse da pessoa. */
  cargos: string[];
  /** true quando já existe documento/currículo na conversa. */
  temCurriculo: boolean;
  /** Contexto livre da empresa (mesmo texto usado na análise). */
  contextoEmpresa: string | null;
}

export function buildTriagemPrompt(input: TriagemPromptInput): { system: string; user: string } {
  const { cfg, estado, passo, turnos, transcript, cargos, temCurriculo, contextoEmpresa } = input;
  const roteiro = roteiroEfetivo(cfg);

  const system = [
    `Você atende o WhatsApp de recrutamento de ${cfg.apresentacao}.`,
    "Sua função é fazer uma triagem inicial de quem chega interessado em vaga:",
    "qualificar em poucas perguntas e deixar o candidato pronto para o RH avaliar.",
    "",
    REGRAS_ESTILO,
    "",
    REGRAS_CONDUTA,
    "",
    "ROTEIRO (siga na ordem, uma pergunta por mensagem):",
    ...roteiro.map((r, i) => `${i + 1}. ${r}`),
    "",
    cargos.length > 0 ? `Vagas que a empresa avalia: ${cargos.join(", ")}.` : "",
    contextoEmpresa ? `Contexto da empresa: ${contextoEmpresa}` : "",
    "",
    "QUANDO ENCERRAR:",
    '- Cumpriu o roteiro e já tem currículo: proximo_estado="concluida", e a mensagem',
    "  avisa que o RH vai analisar e retorna.",
    '- Cumpriu o roteiro mas falta currículo: proximo_estado="aguardando_cv".',
    '- Situação que precisa de gente: proximo_estado="handoff" com motivo_handoff',
    "  preenchido, e mensagem dizendo que alguém do RH vai responder.",
    "",
    "Preencha 'campos' com o que a pessoa já informou; use null no que não souber.",
    "NUNCA deduza um campo que a pessoa não disse.",
    "",
    "Devolva SOMENTE o JSON do turno. 'mensagem' é UMA mensagem só, ou null para",
    "ficar calado.",
  ]
    .filter(Boolean)
    .join("\n");

  const user = [
    `Estado atual: ${estado}. Passo do roteiro: ${passo + 1}/${roteiro.length}. Turnos usados: ${turnos}/${cfg.max_turnos}.`,
    `Currículo já recebido: ${temCurriculo ? "sim" : "não"}.`,
    "",
    "Conversa até agora:",
    transcript,
    "",
    "Responda ao que o candidato mandou por último.",
  ].join("\n");

  return { system, user };
}
