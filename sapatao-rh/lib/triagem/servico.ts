// Ligação da máquina de triagem com o mundo real: banco, UAZAPI e análise.
//
// A máquina (maquina.ts) é pura e testada; aqui só se implementam as deps. Toda
// decisão de "responder ou não" continua lá — este arquivo não pode ter regra de
// negócio escondida.
import "server-only";
import { randomUUID } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { montarTranscript, type TranscriptMsg } from "@/lib/perfil/transcript";
import { processarTurno, type ResultadoTurno, type TriagemDeps, type MotivoSilencio } from "./maquina";
import { dentroDoHorario, horaLocalBr, parseTriagemConfig, type TriagemConfig } from "./config";
import { getIaConfig } from "@/lib/llm/config";
import { getLlmProvider } from "@/lib/llm/factory";
import { LlmError } from "@/lib/llm/types";
import { custoUsd } from "@/lib/llm/modelos";
import { limiteExcedido, tokensUsadosNoMes } from "@/lib/llm/limite";
import { enviarMensagem, type SendDeps } from "@/lib/whatsapp/send";
import { sendText as uazapiSendText } from "@/lib/uazapi/client";
import { getUazapiConfig } from "@/lib/uazapi/config";
import { listCargosIa } from "@/lib/cv/criterios";
import { analisarPerfil } from "@/lib/perfil/analise";
import { montarPerfilDeps } from "@/lib/perfil/deps";
import { criteriosCargoSchema, resolverCargo, type CargoIa } from "@/lib/cv/criterios";
import type { Candidato, Message, TriagemEstado } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;

/** Quanto tempo a claim segura a conversa. Curto: se o processo morrer no meio,
 *  outro worker reassume rápido em vez de a conversa ficar travada. */
const LEASE_MS = 60_000;
const MAX_MENSAGENS_CONTEXTO = 120;

export interface GatilhoCtx {
  empresaId: string;
  conversationId: string;
  candidatoId: string;
}

/**
 * Marca que esta conversa deve ser respondida daqui a `debounce_seg`.
 *
 * Chamado a cada mensagem recebida: se o candidato manda três seguidas, as três
 * empurram `responder_em` para frente e sai UMA resposta só (trava 4).
 * Não envia nada e não chama modelo — é só agendamento.
 */
export async function agendarTriagem(
  admin: Admin,
  ctx: GatilhoCtx,
): Promise<{ agendado: boolean; debounceMs: number }> {
  const { data: criterios } = await admin
    .from("ia_criterios")
    .select("triagem_ativa, triagem_config")
    .eq("empresa_id", ctx.empresaId)
    .maybeSingle();

  // Trava 7: empresa desligada não agenda nada.
  if (!criterios?.triagem_ativa) return { agendado: false, debounceMs: 0 };

  const cfg = parseTriagemConfig(criterios.triagem_config);
  const agora = new Date();
  const responderEm = new Date(agora.getTime() + cfg.debounce_seg * 1000).toISOString();

  // Trava extra contra REENTREGA do provedor: o webhook é idempotente na inserção
  // (índice único em uazapi_msg_id), mas continua chegando aqui. Se a mensagem
  // inbound mais nova não é posterior à última que já processamos, não há nada
  // novo para responder — reentrega não gera segunda resposta.
  const { data: ultimaInbound } = await admin
    .from("messages")
    .select("created_at")
    .eq("conversation_id", ctx.conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!ultimaInbound) return { agendado: false, debounceMs: 0 };

  const { data: existente } = await admin
    .from("ia_triagem")
    .select("id, ativa, ultimo_inbound_em")
    .eq("conversation_id", ctx.conversationId)
    .maybeSingle();

  if (existente) {
    // Conversa já encerrada ou desligada não volta a ser agendada.
    if (!existente.ativa) return { agendado: false, debounceMs: 0 };
    if (
      existente.ultimo_inbound_em &&
      new Date(ultimaInbound.created_at) <= new Date(existente.ultimo_inbound_em)
    ) {
      return { agendado: false, debounceMs: 0 };
    }
    const { error } = await admin
      .from("ia_triagem")
      .update({ responder_em: responderEm, ultimo_inbound_em: ultimaInbound.created_at })
      .eq("id", existente.id);
    if (error) return { agendado: false, debounceMs: 0 };
  } else {
    const { error } = await admin.from("ia_triagem").insert({
      empresa_id: ctx.empresaId,
      conversation_id: ctx.conversationId,
      candidato_id: ctx.candidatoId,
      estado: "aguardando",
      responder_em: responderEm,
      ultimo_inbound_em: ultimaInbound.created_at,
    });
    // 23505 = outra requisição criou primeiro; o agendamento dela já vale.
    if (error && error.code !== "23505") return { agendado: false, debounceMs: 0 };
  }

  return { agendado: true, debounceMs: cfg.debounce_seg * 1000 };
}

interface ContextoConversa {
  cfg: TriagemConfig;
  contextoEmpresa: string | null;
  empresaId: string;
  candidatoId: string;
  telefone: string;
  etapaAtualId: string | null;
  unidadeId: string | null;
  vagaInteresse: string | null;
  token: string;
  criadoEm: string;
}

async function carregarContexto(
  admin: Admin,
  conversationId: string,
): Promise<ContextoConversa | null> {
  const { data: tri } = await admin
    .from("ia_triagem")
    .select("empresa_id, candidato_id, created_at")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (!tri) return null;

  const [{ data: criterios }, { data: cand }, { data: inst }] = await Promise.all([
    admin
      .from("ia_criterios")
      .select("triagem_config, prompt_base")
      .eq("empresa_id", tri.empresa_id)
      .maybeSingle(),
    admin
      .from("candidatos")
      .select("telefone, etapa_id, unidade_id, vaga_interesse")
      .eq("id", tri.candidato_id)
      .maybeSingle(),
    admin
      .from("whatsapp_instances")
      .select("uazapi_token")
      .eq("empresa_id", tri.empresa_id)
      .maybeSingle(),
  ]);
  if (!cand) return null;

  return {
    cfg: parseTriagemConfig(criterios?.triagem_config),
    contextoEmpresa: criterios?.prompt_base ?? null,
    empresaId: tri.empresa_id,
    candidatoId: tri.candidato_id,
    telefone: cand.telefone,
    etapaAtualId: cand.etapa_id,
    unidadeId: cand.unidade_id,
    vagaInteresse: cand.vaga_interesse,
    token: inst?.uazapi_token ?? "",
    criadoEm: tri.created_at,
  };
}

/**
 * Roda um turno da triagem para uma conversa.
 *
 * Chamado pelo webhook (depois do debounce) e pelo worker (rede de proteção).
 * Os dois passam pela MESMA claim atômica, então no máximo um envia.
 */
export async function rodarTriagem(
  admin: Admin,
  conversationId: string,
  agora: Date = new Date(),
): Promise<ResultadoTurno> {
  const ctx = await carregarContexto(admin, conversationId);
  if (!ctx) return { acao: "silencio", motivo: "triagem_inativa" };

  // Debounce: se outra mensagem chegou depois, o agendamento foi empurrado para
  // frente — quem responde é a execução daquela, não esta.
  const { data: agendamento } = await admin
    .from("ia_triagem")
    .select("responder_em")
    .eq("conversation_id", conversationId)
    .maybeSingle();
  if (agendamento?.responder_em && new Date(agendamento.responder_em) > agora) {
    return { acao: "silencio", motivo: "sem_inbound_novo" };
  }

  const iaCfg = await getIaConfig(admin, ctx.empresaId);
  let llm;
  try {
    llm = getLlmProvider(
      ctx.cfg.modelo_triagem ? { ...iaCfg, modelo: ctx.cfg.modelo_triagem } : iaCfg,
    );
  } catch (err) {
    if (err instanceof LlmError) return { acao: "silencio", motivo: "chave_invalida" };
    throw err;
  }

  const uazapi = await getUazapiConfig(admin, ctx.empresaId);
  const deps = montarDeps(admin, conversationId, ctx, llm, iaCfg, uazapi?.baseUrl ?? null);

  return processarTurno(
    { cfg: ctx.cfg, contextoEmpresa: ctx.contextoEmpresa, agora },
    deps,
  );
}

function montarDeps(
  admin: Admin,
  conversationId: string,
  ctx: ContextoConversa,
  llm: ReturnType<typeof getLlmProvider>,
  iaCfg: Awaited<ReturnType<typeof getIaConfig>>,
  baseUrl: string | null,
): TriagemDeps {
  return {
    carregarEstado: async () => {
      const { data } = await admin
        .from("ia_triagem")
        .select("ativa, estado, passo, turnos")
        .eq("conversation_id", conversationId)
        .maybeSingle();
      return data ? { ativa: data.ativa, estado: data.estado, passo: data.passo, turnos: data.turnos } : null;
    },

    // Trava 3: só quem consegue escrever o lease segue. `select` devolve as linhas
    // afetadas, então 1 = ganhou, 0 = outro worker está com a conversa.
    claim: async () => {
      const agoraIso = new Date().toISOString();
      const { data } = await admin
        .from("ia_triagem")
        .update({ processando_ate: new Date(Date.now() + LEASE_MS).toISOString() })
        .eq("conversation_id", conversationId)
        .or(`processando_ate.is.null,processando_ate.lt.${agoraIso}`)
        .select("id");
      return (data?.length ?? 0) === 1;
    },

    liberarClaim: async () => {
      await admin
        .from("ia_triagem")
        .update({ processando_ate: null })
        .eq("conversation_id", conversationId);
    },

    salvarEstado: async (patch) => {
      await admin.from("ia_triagem").update(patch).eq("conversation_id", conversationId);
    },

    empresaAtiva: async () => {
      const { data } = await admin
        .from("ia_criterios")
        .select("triagem_ativa")
        .eq("empresa_id", ctx.empresaId)
        .maybeSingle();
      return !!data?.triagem_ativa;
    },

    // Trava 6: mensagem com sender_id preenchido = pessoa. Só conta o que veio
    // DEPOIS que a triagem começou; conversa antiga do RH não bloqueia.
    gestorAssumiu: async () => {
      const { data } = await admin
        .from("messages")
        .select("id")
        .eq("conversation_id", conversationId)
        .eq("direction", "outbound")
        .not("sender_id", "is", null)
        .gte("created_at", ctx.criadoEm)
        .limit(1);
      return (data?.length ?? 0) > 0;
    },

    // Trava 5: conta no banco o que a IA já mandou na janela.
    contarMensagensIa: async (janelaHoras) => {
      const desde = new Date(Date.now() - janelaHoras * 3_600_000).toISOString();
      const { count } = await admin
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversationId)
        .eq("direction", "outbound")
        .eq("metadata->>origem", "ia")
        .gte("created_at", desde);
      return count ?? 0;
    },

    optedOut: async () => {
      const { data } = await admin
        .from("whatsapp_optouts")
        .select("id")
        .eq("empresa_id", ctx.empresaId)
        .eq("telefone", ctx.telefone)
        .maybeSingle();
      return !!data;
    },

    checarLimite: async () => ({
      excedido: limiteExcedido(await tokensUsadosNoMes(admin, ctx.empresaId), iaCfg.limiteTokensMes),
    }),

    carregarMensagens: async () => {
      const { data } = await admin
        .from("messages")
        .select("id, direction, tipo, conteudo, midia_mime, metadata, transcricao, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_MENSAGENS_CONTEXTO);
      const rows = (data ?? []) as Pick<
        Message,
        "id" | "direction" | "tipo" | "conteudo" | "midia_mime" | "metadata" | "transcricao" | "created_at"
      >[];
      return rows.reverse() as TranscriptMsg[];
    },

    montarTranscript: (msgs) => montarTranscript(msgs),

    getCargos: async () => {
      const cargos = await listCargosIa(ctx.empresaId).catch(() => []);
      return cargos.map((c) => c.nome);
    },

    llmJson: (system, user, opts) => llm.completeJson(system, user, opts),

    enviar: async (texto) => {
      if (!baseUrl || !ctx.token) return { ok: false };
      const sendDeps: SendDeps = {
        loadContext: async () => ({ telefone: ctx.telefone, token: ctx.token }),
        isOptedOut: async (telefone) => {
          const { data } = await admin
            .from("whatsapp_optouts")
            .select("id")
            .eq("empresa_id", ctx.empresaId)
            .eq("telefone", telefone)
            .maybeSingle();
          return !!data;
        },
        findByClientId: async (cid) => {
          const { data } = await admin
            .from("messages")
            .select("id, status")
            .eq("empresa_id", ctx.empresaId)
            .eq("client_message_id", cid)
            .maybeSingle();
          return data ? { id: data.id, status: data.status } : null;
        },
        insertQueued: async (row) => {
          const { data, error } = await admin
            .from("messages")
            .insert({
              empresa_id: row.empresaId,
              conversation_id: row.conversationId,
              direction: "outbound",
              tipo: "text",
              conteudo: row.texto,
              client_message_id: row.clientMessageId,
              // sender_id null + origem 'ia': é assim que a UI mostra a etiqueta
              // e que a trava 5 consegue contar só o que a IA mandou.
              sender_id: null,
              metadata: { origem: "ia" },
              status: "queued",
            })
            .select("id")
            .single();
          return { id: data?.id ?? null, error: error ? { code: error.code, message: error.message } : null };
        },
        reuseFailed: async () => ({ claimed: false, error: null }),
        updateResult: async (messageId, fields) => {
          const patch =
            fields.status === "sent"
              ? { status: "sent" as const, uazapi_msg_id: fields.uazapi_msg_id }
              : { status: "failed" as const, metadata: { origem: "ia", error: fields.error } };
          const { error } = await admin.from("messages").update(patch).eq("id", messageId);
          return { error: error ? { message: error.message } : null };
        },
        sendText: async (token, number, text) => {
          try {
            const { providerId } = await uazapiSendText(baseUrl, token, number.replace(/\D/g, ""), text);
            return { providerId };
          } catch (e) {
            return { providerId: null, error: e instanceof Error ? e.message : "send_error" };
          }
        },
      };

      const r = await enviarMensagem(
        {
          empresaId: ctx.empresaId,
          conversationId,
          texto,
          clientMessageId: randomUUID(),
          senderId: null,
        },
        sendDeps,
      );
      return { ok: r.ok };
    },

    aplicarCampos: async (campos) => {
      // camposParaCadastro só devolve colunas de `candidatos` já validadas pelo
      // schema do turno — o cast é a fronteira entre o dep genérico e a tabela.
      await admin
        .from("candidatos")
        .update(campos as Partial<Candidato>)
        .eq("id", ctx.candidatoId);
    },

    registrarOptout: async () => {
      await admin.from("whatsapp_optouts").insert({
        empresa_id: ctx.empresaId,
        telefone: ctx.telefone,
        motivo: "pedido do candidato na triagem automática",
      });
    },

    concluir: () => concluirTriagem(admin, conversationId, ctx, llm, iaCfg),

    registrarUso: async (uso) => {
      await admin.from("ia_uso").insert({
        empresa_id: ctx.empresaId,
        tipo: "triagem",
        candidato_id: ctx.candidatoId,
        conversation_id: conversationId,
        modelo: llm.modelo,
        tokens_est: uso.tokensEst ?? 0,
        tokens_in: uso.tokensIn,
        tokens_out: uso.tokensOut,
        custo_usd:
          uso.tokensIn !== null && uso.tokensOut !== null
            ? custoUsd(llm.modelo, uso.tokensIn, uso.tokensOut)
            : null,
        status: uso.status,
      });
    },

    // Aviso vira mensagem de sistema na própria conversa: é onde o gestor olha.
    // Não vai para o WhatsApp e não conta no teto (origem != 'ia').
    avisarGestor: async (motivo: MotivoSilencio) => {
      await admin.from("messages").insert({
        empresa_id: ctx.empresaId,
        conversation_id: conversationId,
        direction: "outbound",
        tipo: "system",
        conteudo: textoAviso(motivo),
        sender_id: null,
        status: "sent",
        metadata: { origem: "sistema", motivo },
      });
    },
  };
}

function textoAviso(motivo: MotivoSilencio): string {
  switch (motivo) {
    case "teto_hora":
    case "teto_dia":
      return "A triagem automática foi pausada nesta conversa por atingir o limite de mensagens. Assuma o atendimento.";
    case "max_turnos":
      return "A triagem automática chegou ao limite de perguntas sem concluir. Passou para atendimento humano.";
    case "limite_tokens":
      return "A triagem parou: a cota mensal de IA da empresa acabou.";
    default:
      return `A triagem automática parou nesta conversa (${motivo}).`;
  }
}

/** Ao concluir a triagem, roda a MESMA análise do botão "Analisar perfil". */
async function concluirTriagem(
  admin: Admin,
  conversationId: string,
  ctx: ContextoConversa,
  llm: ReturnType<typeof getLlmProvider>,
  iaCfg: Awaited<ReturnType<typeof getIaConfig>>,
): Promise<void> {
  const { data: cand } = await admin
    .from("candidatos")
    .select("id, nome, telefone, vaga_interesse, idade, cep, endereco, tem_veiculo, tags, notas_internas")
    .eq("id", ctx.candidatoId)
    .maybeSingle();
  if (!cand) return;

  // Cargo pela vaga de interesse; ambíguo vira análise geral (não trava a conclusão).
  let cargo: CargoIa | null = null;
  const cargos = await listCargosIa(ctx.empresaId).catch(() => []);
  const resolvido = resolverCargo(cargos, cand.vaga_interesse);
  if (resolvido.tipo === "match" || resolvido.tipo === "unico") cargo = resolvido.cargo;

  const deps = montarPerfilDeps(admin, admin, {
    empresaId: ctx.empresaId,
    candidatoId: ctx.candidatoId,
    conversationId,
    etapaAtualId: ctx.etapaAtualId,
    unidadeId: ctx.unidadeId,
    cargo,
    movidoPor: null, // foi a IA, não uma pessoa
    cfg: iaCfg,
    llm,
  });

  await analisarPerfil(
    {
      empresaId: ctx.empresaId,
      candidatoId: ctx.candidatoId,
      conversationId,
      candidato: {
        nome: cand.nome ?? "não informado",
        telefone: cand.telefone,
        vaga_interesse: cand.vaga_interesse,
        idade: cand.idade,
        cep: cand.cep,
        endereco: cand.endereco,
        tem_veiculo: cand.tem_veiculo,
        tags: cand.tags ?? [],
        notas_internas: cand.notas_internas,
      },
      cargo,
      movidoPor: "",
    },
    deps,
  );
}

/**
 * Rede de proteção: pega o que o caminho do webhook não conseguiu terminar
 * (processo reiniciado no meio do debounce, por exemplo).
 *
 * A folga existe para o worker NÃO competir com o caminho normal: só entra em
 * agendamento que já venceu há um tempo e ainda não foi respondido.
 */
export const FOLGA_WORKER_MS = 60_000;

export async function varrerPendentes(
  admin: Admin,
  limite = 20,
  agora: Date = new Date(),
): Promise<{ processadas: number }> {
  const corte = new Date(agora.getTime() - FOLGA_WORKER_MS).toISOString();
  const { data } = await admin
    .from("ia_triagem")
    .select("conversation_id")
    .eq("ativa", true)
    .not("responder_em", "is", null)
    .lt("responder_em", corte)
    .limit(limite);

  let processadas = 0;
  for (const linha of data ?? []) {
    try {
      await rodarTriagem(admin, linha.conversation_id, agora);
      processadas++;
    } catch (err) {
      console.error("triagem worker:", err);
    }
  }
  return { processadas };
}

/**
 * Follow-up: a ÚNICA mensagem que o sistema manda sem o candidato ter falado.
 *
 * A garantia de "no máximo um, para sempre" é a claim em followup_enviado_em:
 * a coluna sai de null uma vez só, e quem não conseguir escrever não envia. Não
 * é uma regra de código que pode ter bug de concorrência — é o banco decidindo.
 */
export async function enviarFollowUps(
  admin: Admin,
  limite = 20,
  agora: Date = new Date(),
): Promise<{ enviados: number }> {
  const { data: empresas } = await admin
    .from("ia_criterios")
    .select("empresa_id, triagem_config")
    .eq("triagem_ativa", true);
  if (!empresas?.length) return { enviados: 0 };

  let enviados = 0;
  for (const empresa of empresas) {
    const cfg = parseTriagemConfig(empresa.triagem_config);
    if (!dentroDoHorario(horaLocalBr(agora), cfg)) continue;

    const corte = new Date(agora.getTime() - cfg.followup_horas * 3_600_000).toISOString();
    const { data: candidatas } = await admin
      .from("ia_triagem")
      .select("id, conversation_id, candidato_id")
      .eq("empresa_id", empresa.empresa_id)
      .eq("ativa", true)
      .is("followup_enviado_em", null)
      .in("estado", ["perguntando", "aguardando_cv"])
      .lt("ultimo_inbound_em", corte)
      .limit(limite);

    for (const linha of candidatas ?? []) {
      // Claim: 0 linhas = alguém já mandou o follow-up desta conversa. Aborta.
      const { data: ganhou } = await admin
        .from("ia_triagem")
        .update({ followup_enviado_em: agora.toISOString() })
        .eq("id", linha.id)
        .is("followup_enviado_em", null)
        .select("id");
      if ((ganhou?.length ?? 0) !== 1) continue;

      try {
        const ok = await mandarFollowUp(admin, linha.conversation_id);
        if (ok) enviados++;
      } catch (err) {
        console.error("follow-up:", err);
      }
    }
  }
  return { enviados };
}

const TEXTO_FOLLOWUP =
  "oi! vi que a gente tinha começado seu cadastro por aqui e você não me retornou. ainda tem interesse na vaga?";

async function mandarFollowUp(admin: Admin, conversationId: string): Promise<boolean> {
  const ctx = await carregarContexto(admin, conversationId);
  if (!ctx) return false;

  // As mesmas guardas do turno normal valem aqui: gestor que assumiu, opt-out e
  // teto continuam mandando. O follow-up não é exceção a nada.
  const iaCfg = await getIaConfig(admin, ctx.empresaId);
  const llm = getLlmProvider(iaCfg);
  const uazapi = await getUazapiConfig(admin, ctx.empresaId);
  const deps = montarDeps(admin, conversationId, ctx, llm, iaCfg, uazapi?.baseUrl ?? null);

  if (!(await deps.empresaAtiva())) return false;
  if (await deps.gestorAssumiu()) return false;
  if (await deps.optedOut()) return false;
  if ((await deps.contarMensagensIa(24)) >= ctx.cfg.teto_dia) return false;

  const enviado = await deps.enviar(TEXTO_FOLLOWUP);
  return enviado.ok;
}

export type { ResultadoTurno, TriagemEstado };
