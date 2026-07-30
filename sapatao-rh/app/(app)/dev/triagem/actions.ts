"use server";

// Sandbox da triagem: roda a máquina de estados INTEIRA em memória.
//
// Nada aqui toca a UAZAPI, o histórico real ou o funil. `enviar` só devolve o
// texto para a tela. É onde loop, debounce, teto e tom são validados antes de
// existir risco de mandar mensagem para gente de verdade.
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { getIaConfig } from "@/lib/llm/config";
import { getLlmProvider } from "@/lib/llm/factory";
import { LlmError } from "@/lib/llm/types";
import { custoUsd } from "@/lib/llm/modelos";
import { montarTranscript, type TranscriptMsg } from "@/lib/perfil/transcript";
import { processarTurno, type EstadoTriagem, type ResultadoTurno, type TriagemDeps } from "@/lib/triagem/maquina";
import { parseTriagemConfig } from "@/lib/triagem/config";
import { listCargosIa } from "@/lib/cv/criterios";
import type { TriagemEstado } from "@/types/database";

export interface SimMensagem {
  direction: "inbound" | "outbound";
  tipo: string;
  conteudo: string;
  created_at: string;
}

export interface SimEstado {
  ativa: boolean;
  estado: TriagemEstado;
  passo: number;
  turnos: number;
}

export interface SimInput {
  mensagens: SimMensagem[];
  estado: SimEstado;
  /** Para exercitar a trava de teto sem precisar mandar 6 mensagens. */
  mensagensIaNaHora: number;
  gestorAssumiu: boolean;
  empresaAtiva: boolean;
  /** ISO; permite testar madrugada e horário comercial. */
  agora: string;
}

export interface SimSaida {
  ok: boolean;
  erro?: string;
  resultado?: ResultadoTurno;
  estado?: SimEstado;
  /** Texto que TERIA sido enviado ao candidato. */
  enviada?: string | null;
  modelo?: string;
  tokens?: number;
  custoUsd?: number;
  /** Registro de tudo que a máquina tentou fazer, na ordem. */
  trilha?: string[];
}

function paraTranscriptMsg(m: SimMensagem, i: number): TranscriptMsg {
  return {
    id: `sim-${i}`,
    direction: m.direction,
    tipo: m.tipo,
    conteudo: m.conteudo,
    midia_mime: null,
    metadata: {},
    created_at: m.created_at,
    transcricao: null,
  };
}

export async function simularTurnoAction(input: SimInput): Promise<SimSaida> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    return { ok: false, erro: "Só administradores podem usar o simulador." };
  }

  const admin = createAdminClient();
  const empresaId = profile.empresa_id;

  const { data: criterios } = await admin
    .from("ia_criterios")
    .select("triagem_config, criterios")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const cfg = parseTriagemConfig(criterios?.triagem_config);

  const iaCfg = await getIaConfig(admin, empresaId);
  let llm;
  try {
    llm = getLlmProvider(cfg.modelo_triagem ? { ...iaCfg, modelo: cfg.modelo_triagem } : iaCfg);
  } catch (err) {
    if (err instanceof LlmError) return { ok: false, erro: err.message };
    throw err;
  }

  // Estado e envios vivem só nesta chamada.
  const estado: SimEstado = { ...input.estado };
  const trilha: string[] = [];
  let enviada: string | null = null;
  let tokens = 0;
  let tokensIn = 0;
  let tokensOut = 0;

  const cargos = await listCargosIa(empresaId).catch(() => []);

  const deps: TriagemDeps = {
    carregarEstado: async (): Promise<EstadoTriagem> => ({ ...estado }),
    claim: async () => {
      trilha.push("claim: obtida (simulada)");
      return true;
    },
    liberarClaim: async () => {},
    salvarEstado: async (patch) => {
      Object.assign(estado, patch);
      trilha.push(`estado: ${JSON.stringify(patch)}`);
    },

    empresaAtiva: async () => input.empresaAtiva,
    gestorAssumiu: async () => input.gestorAssumiu,
    contarMensagensIa: async (janela) => (janela === 1 ? input.mensagensIaNaHora : 0),
    optedOut: async () => false,
    checarLimite: async () => ({ excedido: false }),

    carregarMensagens: async () => input.mensagens.map(paraTranscriptMsg),
    montarTranscript: (msgs) => montarTranscript(msgs),
    getCargos: async () => cargos.map((c) => c.nome),

    llmJson: async (system, user, opts) => {
      trilha.push("modelo: chamada");
      const r = await llm.completeJson(system, user, opts);
      tokens += r.tokensEst;
      tokensIn += r.tokensIn ?? 0;
      tokensOut += r.tokensOut ?? 0;
      return r;
    },

    enviar: async (texto) => {
      // AQUI é onde o envio real aconteceria. No sandbox, só registra.
      enviada = texto;
      trilha.push(`envio SIMULADO: "${texto}"`);
      return { ok: true };
    },
    aplicarCampos: async (campos) => {
      trilha.push(`cadastro (simulado): ${JSON.stringify(campos)}`);
    },
    registrarOptout: async () => {
      trilha.push("opt-out (simulado)");
    },
    concluir: async () => {
      trilha.push("conclusão: dispararia análise de perfil e moveria o card");
    },
    registrarUso: async (uso) => {
      trilha.push(`uso: ${uso.status} (${uso.tokensEst ?? 0} tokens)`);
    },
    avisarGestor: async (motivo) => {
      trilha.push(`aviso ao gestor: ${motivo}`);
    },
  };

  let resultado: ResultadoTurno;
  try {
    resultado = await processarTurno(
      { cfg, contextoEmpresa: null, agora: new Date(input.agora) },
      deps,
    );
  } catch (err) {
    return { ok: false, erro: err instanceof Error ? err.message : "erro no simulador", trilha };
  }

  return {
    ok: true,
    resultado,
    estado,
    enviada,
    modelo: llm.modelo,
    tokens,
    custoUsd: custoUsd(llm.modelo, tokensIn, tokensOut),
    trilha,
  };
}
