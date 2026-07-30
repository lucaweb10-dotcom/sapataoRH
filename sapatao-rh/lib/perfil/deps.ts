// Montagem das dependências da análise de perfil.
//
// Extraído da rota /api/perfil/analyze para que a triagem automática possa rodar
// a MESMA análise ao concluir, sem sessão de usuário. A rota passa o client RLS;
// o worker passa o service role — a interface é a mesma.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Message } from "@/types/database";
import type { PerfilDeps, PerfilMensagem } from "./analise";
import type { LlmProvider } from "@/lib/llm/types";
import type { IaConfig } from "@/lib/llm/config";
import type { CargoIa } from "@/lib/cv/criterios";
import { getCriterios } from "@/lib/cv/criterios";
import { extractCvText } from "@/lib/cv/extract-text";
import { limiteExcedido, tokensUsadosNoMes } from "@/lib/llm/limite";
import { custoUsd } from "@/lib/llm/modelos";
import { transcreverPendentes } from "@/lib/chat/transcricao";
import { transcreverAudio } from "@/lib/llm/transcribe";
import { moverParaIaConcluida } from "@/lib/funil/mover-ia";

type Db = SupabaseClient<Database>;

const BUCKET = "whatsapp-media";
const MAX_MENSAGENS = 500;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_IMG_BYTES = 5 * 1024 * 1024;

export interface PerfilCtx {
  empresaId: string;
  candidatoId: string;
  conversationId: string;
  /** Etapa atual do candidato (evita mover para trás). */
  etapaAtualId: string | null;
  unidadeId: string | null;
  cargo: CargoIa | null;
  /** Autor da movimentação no histórico; null quando foi a triagem. */
  movidoPor: string | null;
  cfg: IaConfig;
  llm: LlmProvider;
}

/**
 * `db` faz as leituras/escritas de domínio; `admin` só é usado onde falta grant
 * para o usuário comum (soma de tokens do mês).
 */
export function montarPerfilDeps(db: Db, admin: Db, ctx: PerfilCtx): PerfilDeps {
  const baixar = async (path: string): Promise<{ buffer: Buffer; mime: string } | null> => {
    const { data, error } = await db.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return { buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || "application/octet-stream" };
  };

  return {
    getMensagens: async (conversationId) => {
      // mais recentes primeiro + reverse: conversas gigantes mantêm a cauda recente.
      const { data } = await db
        .from("messages")
        .select("id, direction, tipo, conteudo, midia_url, midia_mime, metadata, transcricao, created_at")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: false })
        .limit(MAX_MENSAGENS);
      const rows = (data ?? []) as Pick<
        Message,
        "id" | "direction" | "tipo" | "conteudo" | "midia_url" | "midia_mime" | "metadata" | "transcricao" | "created_at"
      >[];
      return rows.reverse() as PerfilMensagem[];
    },

    checarLimite: async () => ({
      excedido: limiteExcedido(await tokensUsadosNoMes(admin, ctx.empresaId), ctx.cfg.limiteTokensMes),
    }),

    transcreverPendentes: async (audios) => {
      // Provider mock: sem transcrição (placeholders) — e2e/dev sem chave funciona.
      if (ctx.cfg.provider !== "openai" || !ctx.cfg.apiKey) {
        return { porMensagem: new Map<string, string>(), tokens: 0 };
      }
      const apiKey = ctx.cfg.apiKey;
      return transcreverPendentes(audios, {
        baixarAudio: baixar,
        transcrever: (audio) => transcreverAudio({ apiKey }, audio),
        salvarCache: async (messageId, texto) => {
          const { error } = await db.from("messages").update({ transcricao: texto }).eq("id", messageId);
          return { error };
        },
      });
    },

    getDocumentoTexto: async (path, mime) => {
      const file = await baixar(path);
      if (!file) return null;
      try {
        return await extractCvText(file.buffer, mime);
      } catch {
        return null;
      }
    },

    getAnexoPdf: async (path, nome) => {
      const file = await baixar(path);
      if (!file || file.buffer.length > MAX_PDF_BYTES) return null;
      return { kind: "pdf", mime: "application/pdf", base64: file.buffer.toString("base64"), nome };
    },

    getAnexoImagem: async (path, mime) => {
      const file = await baixar(path);
      if (!file || file.buffer.length > MAX_IMG_BYTES) return null;
      return { kind: "image", mime, base64: file.buffer.toString("base64") };
    },

    getCriterios,

    llmJson: (system, user, opts) => ctx.llm.completeJson(system, user, opts),

    persist: async (candidatoId, score, parecer) => {
      const { error } = await db
        .from("candidatos")
        .update({
          score_ia: score,
          parecer_ia: { ...parecer, cargo: ctx.cargo?.nome ?? null } as unknown as Record<string, unknown>,
        })
        .eq("id", candidatoId);
      return { error };
    },

    registrarAnalise: async (log) => {
      const { error } = await db.from("cv_analises").insert({
        empresa_id: ctx.empresaId,
        candidato_id: ctx.candidatoId,
        message_id: null,
        conversation_id: ctx.conversationId,
        origem: "perfil",
        cargo_nome: ctx.cargo?.nome ?? null,
        score: log.score,
        parecer: (log.parecer as unknown as Record<string, unknown>) ?? null,
        modelo: ctx.llm.modelo,
        tokens_est: log.tokensEst,
        tokens_in: log.tokensIn,
        tokens_out: log.tokensOut,
        custo_usd:
          log.tokensIn !== null && log.tokensOut !== null
            ? custoUsd(ctx.llm.modelo, log.tokensIn, log.tokensOut)
            : null,
        status: log.status,
        movido_por: ctx.movidoPor,
      });
      return { error };
    },

    moverParaAnaliseConcluida: (candidatoId) =>
      moverParaIaConcluida(
        { empresaId: ctx.empresaId, candidatoId, etapaAtualId: ctx.etapaAtualId },
        {
          getFunilDefault: async (empresaId) => {
            // SP7: funil da UNIDADE do candidato (se houver), senão o Geral.
            if (ctx.unidadeId) {
              const { data: daUnidade } = await db
                .from("funis")
                .select("id")
                .eq("empresa_id", empresaId)
                .eq("unidade_id", ctx.unidadeId)
                .eq("ativo", true)
                .maybeSingle();
              if (daUnidade) return daUnidade;
            }
            const { data } = await db
              .from("funis")
              .select("id")
              .eq("empresa_id", empresaId)
              .eq("is_default", true)
              .maybeSingle();
            return data ?? null;
          },
          getEtapas: async (funilId) => {
            const { data } = await db
              .from("funil_etapas")
              .select("id, nome, ordem, marcador")
              .eq("funil_id", funilId)
              .order("ordem", { ascending: true });
            return data ?? [];
          },
          updateEtapa: async (cId, etapaId) => {
            const { error } = await db
              .from("candidatos")
              .update({ etapa_id: etapaId, etapa_entrou_em: new Date().toISOString() })
              .eq("id", cId);
            return { error };
          },
          insertHistory: async (row) => {
            const { error } = await db.from("kanban_history").insert({
              empresa_id: ctx.empresaId,
              candidato_id: ctx.candidatoId,
              de_etapa: row.deEtapa,
              para_etapa: row.paraEtapa,
              movido_por: ctx.movidoPor,
              observacao: row.observacao,
            });
            return { error };
          },
        },
      ),
  };
}
