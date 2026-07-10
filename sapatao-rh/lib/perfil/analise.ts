// Orquestrador da análise de PERFIL por conversa (SP3b) — mesma semântica
// write-first/best-effort de lib/cv/analise.ts, com DI completa p/ teste.
import { LlmError, type LlmAnexo, type LlmJsonOpts } from "@/lib/llm/types";
import { PARECER_JSON_SCHEMA, parseParecer, type Parecer } from "@/lib/cv/parecer";
import type { CargoIa, Criterios } from "@/lib/cv/criterios";
import { buildPerfilPrompt, type PerfilCandidato } from "./prompt";
import { montarTranscript, type TranscriptMsg } from "./transcript";

export type PerfilErro =
  | "sem_mensagens"
  | "limite_excedido"
  | "chave_invalida"
  | "ia_indisponivel"
  | "parecer_invalido"
  | "persist_falhou";

export type PerfilResult =
  | { ok: true; score: number; parecer: Parecer; movido: boolean }
  | { ok: false; error: PerfilErro };

export interface PerfilLog {
  status: "ok" | PerfilErro;
  score: number | null;
  parecer: Parecer | null;
  /** LLM + transcrições desta análise. */
  tokensEst: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
}

export type PerfilMensagem = TranscriptMsg & { midia_url: string | null };

export interface PerfilDeps {
  getMensagens: (conversationId: string) => Promise<PerfilMensagem[]>;
  checarLimite: () => Promise<{ excedido: boolean }>;
  transcreverPendentes: (
    audios: { id: string; midia_url: string | null; transcricao: string | null; created_at: string }[],
  ) => Promise<{ porMensagem: Map<string, string>; tokens: number }>;
  /** DOCX → texto (mammoth); null se falhar. */
  getDocumentoTexto: (path: string, mime: string) => Promise<string | null>;
  /** PDF → anexo multimodal base64; null se falhar/grande demais. */
  getAnexoPdf: (path: string, nome: string) => Promise<LlmAnexo | null>;
  /** Imagem → anexo multimodal base64; null se falhar/grande demais. */
  getAnexoImagem: (path: string, mime: string) => Promise<LlmAnexo | null>;
  getCriterios: (empresaId: string) => Promise<Criterios>;
  llmJson: (
    system: string,
    user: string,
    opts: LlmJsonOpts,
  ) => Promise<{ json: string; tokensEst: number; tokensIn?: number; tokensOut?: number }>;
  persist: (candidatoId: string, score: number, parecer: Parecer) => Promise<{ error: unknown | null }>;
  registrarAnalise: (log: PerfilLog) => Promise<{ error: unknown | null }>;
  /** Retorna true se o card foi movido (feedback na UI). */
  moverParaAnaliseConcluida: (candidatoId: string) => Promise<boolean>;
}

export interface PerfilInput {
  empresaId: string;
  candidatoId: string;
  conversationId: string;
  candidato: PerfilCandidato;
  cargo: CargoIa | null;
  movidoPor: string;
}

export const MAX_IMAGENS = 4;
export const MAX_PDFS = 1;

const PDF_MIME = "application/pdf";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MAX_DOCX = 2;

async function safeLog(deps: PerfilDeps, log: PerfilLog): Promise<void> {
  try {
    await deps.registrarAnalise(log);
  } catch {
    /* auditoria é best-effort — nunca derruba o resultado */
  }
}

function erroLog(status: PerfilErro): PerfilLog {
  return { status, score: null, parecer: null, tokensEst: null, tokensIn: null, tokensOut: null };
}

/**
 * conversa inteira → limite → transcrever áudios (cache) → anexos (PDF/imagens/DOCX)
 * → transcript → prompt (cargo + gerais) → LLM multimodal → validar → persistir →
 * log → mover card (best-effort).
 */
export async function analisarPerfil(input: PerfilInput, deps: PerfilDeps): Promise<PerfilResult> {
  const mensagens = await deps.getMensagens(input.conversationId);
  const analisaveis = mensagens.filter((m) => m.tipo !== "system");
  if (analisaveis.length === 0) {
    await safeLog(deps, erroLog("sem_mensagens"));
    return { ok: false, error: "sem_mensagens" };
  }

  // Limite ANTES de qualquer chamada paga (transcrição inclusa).
  const { excedido } = await deps.checarLimite();
  if (excedido) {
    await safeLog(deps, erroLog("limite_excedido"));
    return { ok: false, error: "limite_excedido" };
  }

  // Áudios: cache ou transcrição nova.
  const audios = analisaveis
    .filter((m) => (m.tipo === "audio" || m.tipo === "ptt") && m.midia_url)
    .map((m) => ({ id: m.id, midia_url: m.midia_url, transcricao: m.transcricao, created_at: m.created_at }));
  let transcricoes: Map<string, string>;
  let tokensTranscricao = 0;
  try {
    const r = await deps.transcreverPendentes(audios);
    transcricoes = r.porMensagem;
    tokensTranscricao = r.tokens;
  } catch (err) {
    const status = err instanceof LlmError && err.code === "chave_invalida" ? "chave_invalida" : "ia_indisponivel";
    await safeLog(deps, erroLog(status));
    return { ok: false, error: status };
  }

  // Anexos: PDFs mais recentes primeiro (1 vai multimodal), DOCX via extração, imagens inbound.
  const recentesPrimeiro = [...analisaveis].reverse();
  const anexos: LlmAnexo[] = [];
  const docsTexto: { nome: string; texto: string }[] = [];

  let pdfs = 0;
  let docx = 0;
  for (const m of recentesPrimeiro) {
    if (m.tipo !== "document" || !m.midia_url) continue;
    const nome = typeof m.metadata.fileName === "string" ? m.metadata.fileName : "documento";
    if (m.midia_mime === PDF_MIME && pdfs < MAX_PDFS) {
      const anexo = await deps.getAnexoPdf(m.midia_url, nome);
      if (anexo) {
        anexos.push(anexo);
        pdfs++;
      }
    } else if (m.midia_mime === DOCX_MIME && docx < MAX_DOCX) {
      const texto = await deps.getDocumentoTexto(m.midia_url, m.midia_mime);
      if (texto && texto.trim()) {
        docsTexto.push({ nome, texto });
        docx++;
      }
    }
  }

  let imagens = 0;
  for (const m of recentesPrimeiro) {
    if (imagens >= MAX_IMAGENS) break;
    if (m.tipo !== "image" || m.direction !== "inbound" || !m.midia_url) continue;
    const anexo = await deps.getAnexoImagem(m.midia_url, m.midia_mime ?? "image/jpeg");
    if (anexo) {
      anexos.push(anexo);
      imagens++;
    }
  }

  // Transcript + prompt.
  const msgsComTranscricao: TranscriptMsg[] = analisaveis.map((m) => ({
    ...m,
    transcricao: transcricoes.get(m.id) ?? m.transcricao,
  }));
  const transcript = montarTranscript(msgsComTranscricao);
  const criterios = await deps.getCriterios(input.empresaId);
  const { system, user } = buildPerfilPrompt(criterios, input.cargo, input.candidato, transcript, docsTexto);

  let llmOut: { json: string; tokensEst: number; tokensIn?: number; tokensOut?: number };
  try {
    llmOut = await deps.llmJson(system, user, { anexos, jsonSchema: PARECER_JSON_SCHEMA });
  } catch (err) {
    const status = err instanceof LlmError && err.code === "chave_invalida" ? "chave_invalida" : "ia_indisponivel";
    // Transcrições já foram PAGAS — precisam contar no teto mensal mesmo com o LLM falhando.
    await safeLog(deps, {
      status,
      score: null,
      parecer: null,
      tokensEst: tokensTranscricao > 0 ? tokensTranscricao : null,
      tokensIn: null,
      tokensOut: null,
    });
    return { ok: false, error: status };
  }

  const tokensEst = llmOut.tokensEst + tokensTranscricao;
  const tokensIn = llmOut.tokensIn ?? null;
  const tokensOut = llmOut.tokensOut ?? null;

  const parecer = parseParecer(llmOut.json);
  if (!parecer) {
    await safeLog(deps, { status: "parecer_invalido", score: null, parecer: null, tokensEst, tokensIn, tokensOut });
    return { ok: false, error: "parecer_invalido" };
  }

  let p: { error: unknown | null };
  try {
    p = await deps.persist(input.candidatoId, parecer.score, parecer);
  } catch {
    p = { error: new Error("persist rejeitou") };
  }
  if (p.error) {
    await safeLog(deps, { status: "persist_falhou", score: parecer.score, parecer, tokensEst, tokensIn, tokensOut });
    return { ok: false, error: "persist_falhou" };
  }

  await safeLog(deps, { status: "ok", score: parecer.score, parecer, tokensEst, tokensIn, tokensOut });

  let movido = false;
  try {
    movido = await deps.moverParaAnaliseConcluida(input.candidatoId);
  } catch {
    /* move é best-effort */
  }
  return { ok: true, score: parecer.score, parecer, movido };
}
