// Orquestrador do copiloto do gestor — mesma semântica de DI de lib/perfil/analise.ts:
// nada de banco aqui dentro, tudo injetado, para o teste rodar sem infra.
import { LlmError, type LlmChatMsg } from "@/lib/llm/types";
import type { TranscriptMsg } from "@/lib/perfil/transcript";
import { SYSTEM_COPILOTO, buildContextoCopiloto, type CandidatoContexto } from "./contexto";

export type CopilotoErro =
  | "pergunta_vazia"
  | "limite_excedido"
  | "chave_invalida"
  | "ia_indisponivel"
  | "resposta_vazia";

export type CopilotoResult =
  | { ok: true; resposta: string; tokensEst: number }
  | { ok: false; error: CopilotoErro };

/** Turnos anteriores da thread mantidos no contexto. Mais que isso, o custo cresce
 *  sem ganho: o contexto do candidato já vai inteiro na primeira mensagem. */
export const MAX_TURNOS_THREAD = 12;
export const MAX_PERGUNTA_CHARS = 2_000;

export interface CopilotoDeps {
  /** Histórico da thread (mais antigo primeiro), já limitado pelo chamador. */
  getThread: () => Promise<LlmChatMsg[]>;
  getCandidato: () => Promise<CandidatoContexto | null>;
  getMensagens: () => Promise<TranscriptMsg[]>;
  checarLimite: () => Promise<{ excedido: boolean }>;
  completeChat: (
    system: string,
    mensagens: LlmChatMsg[],
  ) => Promise<{ texto: string; tokensEst: number; tokensIn?: number; tokensOut?: number }>;
  /** Grava o par (pergunta, resposta). Best-effort: falhar aqui não perde a resposta. */
  persistir: (pergunta: string, resposta: string) => Promise<void>;
  registrarUso: (uso: {
    status: string;
    tokensEst: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }) => Promise<void>;
}

async function safeUso(
  deps: CopilotoDeps,
  status: string,
  tokensEst: number | null = null,
  tokensIn: number | null = null,
  tokensOut: number | null = null,
): Promise<void> {
  try {
    await deps.registrarUso({ status, tokensEst, tokensIn, tokensOut });
  } catch {
    /* auditoria é best-effort */
  }
}

/**
 * Uma pergunta do gestor → uma resposta da IA.
 *
 * O contexto do candidato entra como PRIMEIRA mensagem de usuário da thread, não
 * no system: assim o histórico de turnos segue depois dele naturalmente, e o
 * system fica só com as regras (que não mudam entre turnos).
 */
export async function perguntarAoCopiloto(
  pergunta: string,
  deps: CopilotoDeps,
): Promise<CopilotoResult> {
  const texto = pergunta.trim().slice(0, MAX_PERGUNTA_CHARS);
  if (!texto) return { ok: false, error: "pergunta_vazia" };

  const { excedido } = await deps.checarLimite();
  if (excedido) {
    await safeUso(deps, "limite_excedido");
    return { ok: false, error: "limite_excedido" };
  }

  const candidato = await deps.getCandidato();
  if (!candidato) {
    await safeUso(deps, "candidato_nao_encontrado");
    return { ok: false, error: "ia_indisponivel" };
  }

  const mensagens = await deps.getMensagens();
  const contexto = buildContextoCopiloto(candidato, mensagens);
  const thread = await deps.getThread();

  const entrada: LlmChatMsg[] = [
    { role: "user", conteudo: contexto },
    { role: "assistant", conteudo: "Contexto recebido. Pode perguntar." },
    ...thread.slice(-MAX_TURNOS_THREAD),
    { role: "user", conteudo: texto },
  ];

  let saida: { texto: string; tokensEst: number; tokensIn?: number; tokensOut?: number };
  try {
    saida = await deps.completeChat(SYSTEM_COPILOTO, entrada);
  } catch (err) {
    const status = err instanceof LlmError && err.code === "chave_invalida" ? "chave_invalida" : "ia_indisponivel";
    await safeUso(deps, status);
    return { ok: false, error: status };
  }

  const resposta = saida.texto.trim();
  if (!resposta) {
    await safeUso(deps, "resposta_vazia", saida.tokensEst, saida.tokensIn ?? null, saida.tokensOut ?? null);
    return { ok: false, error: "resposta_vazia" };
  }

  await safeUso(deps, "ok", saida.tokensEst, saida.tokensIn ?? null, saida.tokensOut ?? null);

  try {
    await deps.persistir(texto, resposta);
  } catch {
    /* a resposta já é válida mesmo se o histórico não gravar */
  }

  return { ok: true, resposta, tokensEst: saida.tokensEst };
}
