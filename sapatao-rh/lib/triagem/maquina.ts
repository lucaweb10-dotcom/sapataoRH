// Núcleo da triagem automática: um turno, uma resposta, no máximo.
//
// AS SETE TRAVAS ANTI-LOOP (a ordem importa: as baratas vêm antes das caras):
//   1. só inbound dispara      — não existe caminho autônomo; quem chama é o webhook
//   2. saída é UMA string      — garantido pelo schema em turno.ts, não por prompt
//   3. claim atômica           — deps.claim(); dois workers, um só responde
//   4. debounce                — quem agenda é o chamador (responder_em)
//   5. teto por conversa       — deps.contarMensagensIa(); a rede de segurança
//   6. gestor assumiu          — deps.gestorAssumiu(); permanente, nunca volta
//   7. kill switch da empresa  — deps.empresaAtiva()
//
// Qualquer uma sozinha já impede disparo em massa. Elas são independentes de
// propósito: bug numa não derruba as outras.
import { LlmError } from "@/lib/llm/types";
import type { TranscriptMsg } from "@/lib/perfil/transcript";
import type { TriagemEstado } from "@/types/database";
import { aplicarEstilo, instrucaoCorrecao, type ViolacaoEstilo } from "./estilo";
import { dentroDoHorario, horaLocalBr, roteiroEfetivo, type TriagemConfig } from "./config";
import { TURNO_JSON_SCHEMA, parseTurno, camposParaCadastro, type Turno } from "./turno";
import { buildTriagemPrompt } from "./prompt";

/** Por que a IA ficou calada — vai para motivo_parada e para o log. */
export type MotivoSilencio =
  | "empresa_desligada"
  | "triagem_inativa"
  | "estado_terminal"
  | "gestor_assumiu"
  | "optout"
  | "fora_do_horario"
  | "sem_inbound_novo"
  | "ocupada"
  | "teto_hora"
  | "teto_dia"
  | "max_turnos"
  | "limite_tokens"
  | "chave_invalida"
  | "ia_indisponivel"
  | "turno_invalido"
  | "estilo_reprovado"
  | "modelo_calou"
  | "envio_falhou";

export type ResultadoTurno =
  | { acao: "enviou"; texto: string; estado: TriagemEstado; concluiu: boolean }
  | { acao: "silencio"; motivo: MotivoSilencio };

export interface EstadoTriagem {
  ativa: boolean;
  estado: TriagemEstado;
  passo: number;
  turnos: number;
}

export interface PatchEstado {
  estado?: TriagemEstado;
  passo?: number;
  turnos?: number;
  ativa?: boolean;
  motivo_parada?: string | null;
  responder_em?: null;
}

export interface TriagemDeps {
  /** null = conversa sem triagem (nunca foi ligada aqui). */
  carregarEstado: () => Promise<EstadoTriagem | null>;
  /** Trava 3. false = outro worker pegou; abortar sem fazer nada. */
  claim: () => Promise<boolean>;
  liberarClaim: () => Promise<void>;
  salvarEstado: (patch: PatchEstado) => Promise<void>;

  /** Trava 7. */
  empresaAtiva: () => Promise<boolean>;
  /** Trava 6. true assim que um humano mandou mensagem nesta conversa. */
  gestorAssumiu: () => Promise<boolean>;
  /** Trava 5. Conta mensagens marcadas origem=ia na janela. */
  contarMensagensIa: (janelaHoras: number) => Promise<number>;
  optedOut: () => Promise<boolean>;
  checarLimite: () => Promise<{ excedido: boolean }>;

  carregarMensagens: () => Promise<TranscriptMsg[]>;
  montarTranscript: (msgs: TranscriptMsg[]) => string;
  getCargos: () => Promise<string[]>;

  llmJson: (
    system: string,
    user: string,
    opts: { jsonSchema: { name: string; schema: Record<string, unknown> } },
  ) => Promise<{ json: string; tokensEst: number; tokensIn?: number; tokensOut?: number }>;

  /** Envia UMA mensagem já validada, marcada como origem=ia. */
  enviar: (texto: string) => Promise<{ ok: boolean }>;
  aplicarCampos: (campos: Record<string, unknown>) => Promise<void>;
  registrarOptout: () => Promise<void>;
  /** Dispara a análise de perfil e move o card. Best-effort. */
  concluir: () => Promise<void>;
  registrarUso: (uso: {
    status: string;
    tokensEst: number | null;
    tokensIn: number | null;
    tokensOut: number | null;
  }) => Promise<void>;
  avisarGestor: (motivo: MotivoSilencio) => Promise<void>;
}

export interface TriagemInput {
  cfg: TriagemConfig;
  contextoEmpresa: string | null;
  agora: Date;
}

const ESTADOS_TERMINAIS: TriagemEstado[] = ["concluida", "handoff", "pausada"];

async function silencio(
  deps: TriagemDeps,
  motivo: MotivoSilencio,
  patch?: PatchEstado,
): Promise<ResultadoTurno> {
  if (patch) {
    try {
      await deps.salvarEstado(patch);
    } catch {
      /* o silêncio já é o comportamento seguro */
    }
  }
  return { acao: "silencio", motivo };
}

/** Guardas que NÃO precisam da claim: baratas e sem efeito colateral. */
async function guardasIniciais(
  deps: TriagemDeps,
  input: TriagemInput,
  estado: EstadoTriagem,
): Promise<MotivoSilencio | null> {
  if (!(await deps.empresaAtiva())) return "empresa_desligada";
  if (!estado.ativa) return "triagem_inativa";
  if (ESTADOS_TERMINAIS.includes(estado.estado)) return "estado_terminal";
  if (await deps.gestorAssumiu()) return "gestor_assumiu";
  if (await deps.optedOut()) return "optout";
  if (!dentroDoHorario(horaLocalBr(input.agora), input.cfg)) return "fora_do_horario";
  return null;
}

/**
 * Processa UM turno da triagem para uma conversa.
 *
 * Só é chamada depois que o candidato mandou mensagem (trava 1) e o debounce
 * venceu (trava 4). Devolve `silencio` em toda situação de dúvida: não responder
 * é sempre mais seguro do que responder errado.
 */
export async function processarTurno(
  input: TriagemInput,
  deps: TriagemDeps,
): Promise<ResultadoTurno> {
  const estado = await deps.carregarEstado();
  if (!estado) return { acao: "silencio", motivo: "triagem_inativa" };

  const bloqueio = await guardasIniciais(deps, input, estado);
  if (bloqueio) {
    // "gestor_assumiu" desliga de vez: a IA não volta sozinha nesta conversa.
    if (bloqueio === "gestor_assumiu") {
      return silencio(deps, bloqueio, { ativa: false, motivo_parada: bloqueio, responder_em: null });
    }
    // Fora do horário NÃO limpa o agendamento: o worker tenta de novo mais tarde.
    if (bloqueio === "fora_do_horario") return silencio(deps, bloqueio);
    return silencio(deps, bloqueio, { responder_em: null });
  }

  // Trava 3: a partir daqui só um worker segue.
  if (!(await deps.claim())) return { acao: "silencio", motivo: "ocupada" };

  try {
    // Trava 5: teto duro, checado no banco. Mesmo com bug em tudo acima, para aqui.
    const naHora = await deps.contarMensagensIa(1);
    if (naHora >= input.cfg.teto_hora) {
      await deps.avisarGestor("teto_hora");
      return silencio(deps, "teto_hora", {
        estado: "pausada",
        ativa: false,
        motivo_parada: "teto_hora",
        responder_em: null,
      });
    }
    const noDia = await deps.contarMensagensIa(24);
    if (noDia >= input.cfg.teto_dia) {
      await deps.avisarGestor("teto_dia");
      return silencio(deps, "teto_dia", {
        estado: "pausada",
        ativa: false,
        motivo_parada: "teto_dia",
        responder_em: null,
      });
    }

    if (estado.turnos >= input.cfg.max_turnos) {
      await deps.avisarGestor("max_turnos");
      return silencio(deps, "max_turnos", {
        estado: "handoff",
        motivo_parada: "max_turnos",
        responder_em: null,
      });
    }

    if ((await deps.checarLimite()).excedido) {
      await deps.avisarGestor("limite_tokens");
      return silencio(deps, "limite_tokens", { responder_em: null });
    }

    const mensagens = await deps.carregarMensagens();
    const transcript = deps.montarTranscript(mensagens);
    const temCurriculo = mensagens.some((m) => m.tipo === "document");
    const cargos = await deps.getCargos();

    const { system, user } = buildTriagemPrompt({
      cfg: input.cfg,
      estado: estado.estado,
      passo: estado.passo,
      turnos: estado.turnos,
      transcript,
      cargos,
      temCurriculo,
      contextoEmpresa: input.contextoEmpresa,
    });

    const gerado = await gerarTurno(deps, system, user);
    if ("erro" in gerado) return silencio(deps, gerado.erro, { responder_em: null });

    const { turno, texto } = gerado;

    // Campos extraídos alimentam o cadastro (best-effort: não bloqueia a resposta).
    const campos = camposParaCadastro(turno.campos);
    if (Object.keys(campos).length > 0) {
      try {
        await deps.aplicarCampos(campos);
      } catch {
        /* cadastro é enriquecimento, não pré-requisito */
      }
    }

    if (turno.intencao === "parar") {
      try {
        await deps.registrarOptout();
      } catch {
        /* segue: o estado terminal já impede novas mensagens */
      }
      // Se o modelo escreveu uma despedida curta, ela ainda sai; senão, silêncio.
      if (!texto) {
        return silencio(deps, "modelo_calou", {
          estado: "handoff",
          motivo_parada: "optout",
          ativa: false,
          responder_em: null,
        });
      }
    }

    if (!texto) {
      return silencio(deps, "modelo_calou", {
        estado: turno.proximo_estado,
        turnos: estado.turnos + 1,
        responder_em: null,
      });
    }

    const enviado = await deps.enviar(texto);
    if (!enviado.ok) return silencio(deps, "envio_falhou", { responder_em: null });

    const proximoEstado: TriagemEstado =
      turno.intencao === "parar" ? "handoff" : turno.proximo_estado;
    const roteiro = roteiroEfetivo(input.cfg);

    await deps.salvarEstado({
      estado: proximoEstado,
      passo: Math.min(estado.passo + 1, roteiro.length - 1),
      turnos: estado.turnos + 1,
      responder_em: null,
      ...(proximoEstado === "handoff" || turno.intencao === "parar"
        ? { ativa: false, motivo_parada: turno.motivo_handoff ?? turno.intencao }
        : {}),
    });

    let concluiu = false;
    if (proximoEstado === "concluida") {
      try {
        await deps.concluir();
        concluiu = true;
      } catch {
        /* a análise pode ser refeita à mão; a triagem em si deu certo */
      }
    }

    return { acao: "enviou", texto, estado: proximoEstado, concluiu };
  } finally {
    await deps.liberarClaim().catch(() => {});
  }
}

/**
 * Gera o turno e força o estilo. No máximo 2 chamadas ao modelo: se a segunda
 * ainda vier fora do padrão, a IA fica calada em vez de mandar algo com cara de
 * robô — mensagem ruim é pior que mensagem nenhuma.
 */
async function gerarTurno(
  deps: TriagemDeps,
  system: string,
  user: string,
): Promise<{ turno: Turno; texto: string | null } | { erro: MotivoSilencio }> {
  let tokensAcumulados = 0;
  let violacoes: ViolacaoEstilo[] = [];

  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const systemTentativa =
      tentativa === 0 ? system : `${system}\n\n${instrucaoCorrecao(violacoes)}`;

    let saida: { json: string; tokensEst: number; tokensIn?: number; tokensOut?: number };
    try {
      saida = await deps.llmJson(systemTentativa, user, { jsonSchema: TURNO_JSON_SCHEMA });
    } catch (err) {
      const status =
        err instanceof LlmError && err.code === "chave_invalida" ? "chave_invalida" : "ia_indisponivel";
      await registrar(deps, status, tokensAcumulados || null, null, null);
      return { erro: status };
    }

    tokensAcumulados += saida.tokensEst;
    const turno = parseTurno(saida.json);
    if (!turno) {
      await registrar(deps, "turno_invalido", tokensAcumulados, saida.tokensIn ?? null, saida.tokensOut ?? null);
      return { erro: "turno_invalido" };
    }

    // Sem mensagem não há estilo a validar.
    if (turno.mensagem === null || !turno.mensagem.trim()) {
      await registrar(deps, "ok", tokensAcumulados, saida.tokensIn ?? null, saida.tokensOut ?? null);
      return { turno, texto: null };
    }

    const estilo = aplicarEstilo(turno.mensagem);
    if (estilo.ok) {
      await registrar(
        deps,
        estilo.sanitizada ? "ok_sanitizada" : "ok",
        tokensAcumulados,
        saida.tokensIn ?? null,
        saida.tokensOut ?? null,
      );
      return { turno, texto: estilo.texto };
    }
    violacoes = estilo.violacoes;
  }

  await registrar(deps, "estilo_reprovado", tokensAcumulados, null, null);
  return { erro: "estilo_reprovado" };
}

async function registrar(
  deps: TriagemDeps,
  status: string,
  tokensEst: number | null,
  tokensIn: number | null,
  tokensOut: number | null,
): Promise<void> {
  try {
    await deps.registrarUso({ status, tokensEst, tokensIn, tokensOut });
  } catch {
    /* auditoria é best-effort */
  }
}
