import { buildCvPrompt } from "./prompt";
import { parseParecer, type Parecer } from "./parecer";
import type { Criterios } from "./criterios";

export type AnaliseErro =
  | "arquivo_invalido"
  | "texto_vazio"
  | "ia_indisponivel"
  | "parecer_invalido"
  | "persist_falhou";

export type AnaliseResult = { ok: true; score: number; parecer: Parecer } | { ok: false; error: AnaliseErro };

export interface AnaliseLog {
  status: "ok" | AnaliseErro;
  score: number | null;
  parecer: Parecer | null;
  tokensEst: number | null;
}

export interface AnaliseDeps {
  getCvFile: (path: string) => Promise<{ buffer: Buffer; mime: string } | null>;
  extractText: (buffer: Buffer, mime: string) => Promise<string>;
  getCriterios: (empresaId: string) => Promise<Criterios>;
  llmJson: (system: string, user: string) => Promise<{ json: string; tokensEst: number }>;
  persist: (candidatoId: string, score: number, parecer: Parecer) => Promise<{ error: unknown | null }>;
  registrarAnalise: (row: AnaliseLog) => Promise<{ error: unknown | null }>;
  moverParaAnaliseConcluida: (candidatoId: string) => Promise<void>;
}

export interface AnaliseInput {
  empresaId: string;
  candidatoId: string;
  cvPath: string;
  vagaInteresse: string | null;
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
  const { system, user } = buildCvPrompt(criterios, input.vagaInteresse, texto);

  let llmOut: { json: string; tokensEst: number };
  try {
    llmOut = await deps.llmJson(system, user);
  } catch {
    await safeLog(deps, { status: "ia_indisponivel", score: null, parecer: null, tokensEst: null });
    return { ok: false, error: "ia_indisponivel" };
  }

  const parecer = parseParecer(llmOut.json);
  if (!parecer) {
    await safeLog(deps, { status: "parecer_invalido", score: null, parecer: null, tokensEst: llmOut.tokensEst });
    return { ok: false, error: "parecer_invalido" };
  }

  const p = await deps.persist(input.candidatoId, parecer.score, parecer);
  if (p.error) {
    await safeLog(deps, { status: "persist_falhou", score: parecer.score, parecer, tokensEst: llmOut.tokensEst });
    return { ok: false, error: "persist_falhou" };
  }

  await safeLog(deps, { status: "ok", score: parecer.score, parecer, tokensEst: llmOut.tokensEst });
  try {
    await deps.moverParaAnaliseConcluida(input.candidatoId);
  } catch {
    /* move forward-only é best-effort */
  }
  return { ok: true, score: parecer.score, parecer };
}
