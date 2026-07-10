import { LlmError } from "@/lib/llm/types";
import { buildCvPrompt } from "./prompt";
import { parseParecer, type Parecer } from "./parecer";
import type { CargoIa, Criterios } from "./criterios";

export type AnaliseErro =
  | "arquivo_invalido"
  | "texto_vazio"
  | "chave_invalida"
  | "ia_indisponivel"
  | "parecer_invalido"
  | "persist_falhou";

export type AnaliseResult = { ok: true; score: number; parecer: Parecer } | { ok: false; error: AnaliseErro };

export interface AnaliseLog {
  status: "ok" | AnaliseErro;
  score: number | null;
  parecer: Parecer | null;
  tokensEst: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
}

export interface AnaliseDeps {
  getCvFile: (path: string) => Promise<{ buffer: Buffer; mime: string } | null>;
  extractText: (buffer: Buffer, mime: string) => Promise<string>;
  getCriterios: (empresaId: string) => Promise<Criterios>;
  llmJson: (
    system: string,
    user: string,
  ) => Promise<{ json: string; tokensEst: number; tokensIn?: number; tokensOut?: number }>;
  persist: (candidatoId: string, score: number, parecer: Parecer) => Promise<{ error: unknown | null }>;
  registrarAnalise: (row: AnaliseLog) => Promise<{ error: unknown | null }>;
  moverParaAnaliseConcluida: (candidatoId: string) => Promise<void>;
}

export interface AnaliseInput {
  empresaId: string;
  candidatoId: string;
  cvPath: string;
  vagaInteresse: string | null;
  /** Cargo de avaliação (SP3b); null/ausente = avaliação geral. */
  cargo?: CargoIa | null;
  movidoPor: string;
}

async function safeLog(deps: AnaliseDeps, log: AnaliseLog): Promise<void> {
  try {
    await deps.registrarAnalise(log);
  } catch {
    /* auditoria é best-effort — nunca derruba o resultado */
  }
}

/**
 * Orchestrates a CV analysis (write-first, then move/audit best-effort):
 * download → extract → criteria → prompt → LLM → validate → persist → log → move.
 * Persistence happens before the auto-move; the move and the audit log never turn
 * an already-persisted result into an error. Fully injectable for testing.
 */
export async function analisarCurriculo(input: AnaliseInput, deps: AnaliseDeps): Promise<AnaliseResult> {
  const file = await deps.getCvFile(input.cvPath);
  if (!file) {
    await safeLog(deps, { status: "arquivo_invalido", score: null, parecer: null, tokensEst: null });
    return { ok: false, error: "arquivo_invalido" };
  }

  let texto: string;
  try {
    texto = await deps.extractText(file.buffer, file.mime);
  } catch {
    await safeLog(deps, { status: "arquivo_invalido", score: null, parecer: null, tokensEst: null });
    return { ok: false, error: "arquivo_invalido" };
  }
  if (!texto || texto.trim().length === 0) {
    await safeLog(deps, { status: "texto_vazio", score: null, parecer: null, tokensEst: null });
    return { ok: false, error: "texto_vazio" };
  }

  const criterios = await deps.getCriterios(input.empresaId);
  const { system, user } = buildCvPrompt(criterios, input.vagaInteresse, texto, input.cargo ?? null);

  let llmOut: { json: string; tokensEst: number; tokensIn?: number; tokensOut?: number };
  try {
    llmOut = await deps.llmJson(system, user);
  } catch (err) {
    // 401 da OpenAI não é "indisponível" — é chave errada, e a UI trata diferente.
    const status: AnaliseErro =
      err instanceof LlmError && err.code === "chave_invalida" ? "chave_invalida" : "ia_indisponivel";
    await safeLog(deps, { status, score: null, parecer: null, tokensEst: null });
    return { ok: false, error: status };
  }

  const tokensIn = llmOut.tokensIn ?? null;
  const tokensOut = llmOut.tokensOut ?? null;

  const parecer = parseParecer(llmOut.json);
  if (!parecer) {
    await safeLog(deps, {
      status: "parecer_invalido",
      score: null,
      parecer: null,
      tokensEst: llmOut.tokensEst,
      tokensIn,
      tokensOut,
    });
    return { ok: false, error: "parecer_invalido" };
  }

  let p: { error: unknown | null };
  try {
    p = await deps.persist(input.candidatoId, parecer.score, parecer);
  } catch {
    p = { error: new Error("persist rejeitou") };
  }
  if (p.error) {
    await safeLog(deps, {
      status: "persist_falhou",
      score: parecer.score,
      parecer,
      tokensEst: llmOut.tokensEst,
      tokensIn,
      tokensOut,
    });
    return { ok: false, error: "persist_falhou" };
  }

  await safeLog(deps, {
    status: "ok",
    score: parecer.score,
    parecer,
    tokensEst: llmOut.tokensEst,
    tokensIn,
    tokensOut,
  });
  try {
    await deps.moverParaAnaliseConcluida(input.candidatoId);
  } catch {
    /* move forward-only é best-effort */
  }
  return { ok: true, score: parecer.score, parecer };
}
