import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarPerfil, type PerfilDeps, type PerfilErro, type PerfilMensagem } from "@/lib/perfil/analise";
import { extractCvText } from "@/lib/cv/extract-text";
import {
  getCriterios,
  listCargosIa,
  resolverCargo,
  criteriosCargoSchema,
  type CargoIa,
} from "@/lib/cv/criterios";
import { getLlmProvider } from "@/lib/llm/factory";
import { getIaConfig } from "@/lib/llm/config";
import { LlmError } from "@/lib/llm/types";
import { limiteExcedido, tokensUsadosNoMes } from "@/lib/llm/limite";
import { custoUsd } from "@/lib/llm/modelos";
import { transcreverPendentes } from "@/lib/chat/transcricao";
import { transcreverAudio } from "@/lib/llm/transcribe";
import { moverParaIaConcluida } from "@/lib/funil/mover-ia";
import { perfilAnalyzeSchema } from "@/lib/validations/perfil";
import type { Message } from "@/types/database";

export const runtime = "nodejs"; // mammoth/pdf precisam do runtime Node
export const maxDuration = 120; // transcrições + LLM podem passar de 30s na 1ª análise

const BUCKET = "whatsapp-media";
const MAX_MENSAGENS = 500;
const MAX_PDF_BYTES = 8 * 1024 * 1024;
const MAX_IMG_BYTES = 5 * 1024 * 1024;

const ERRO_HTTP: Record<PerfilErro | "cargo_indefinido", { status: number; message: string }> = {
  sem_mensagens: { status: 422, message: "Esta conversa ainda não tem conteúdo suficiente para análise." },
  cargo_indefinido: { status: 422, message: "Escolha o cargo da análise." },
  chave_invalida: {
    status: 422,
    message: "Chave da OpenAI ausente ou inválida. Configure em Configurações → IA.",
  },
  limite_excedido: {
    status: 429,
    message: "Limite mensal de tokens de IA da empresa atingido. Ajuste em Configurações → IA.",
  },
  ia_indisponivel: { status: 502, message: "A IA está indisponível no momento. Tente novamente." },
  parecer_invalido: { status: 502, message: "A IA retornou um resultado inválido. Tente novamente." },
  persist_falhou: { status: 500, message: "Falha ao salvar a análise. Tente novamente." },
};

function erroJson(code: keyof typeof ERRO_HTTP) {
  const e = ERRO_HTTP[code];
  return NextResponse.json({ error: code, message: e.message }, { status: e.status });
}

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "rh" && !profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = perfilAnalyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "conversationId inválido." }, { status: 400 });
  }

  const supabase = await createClient();

  const { data: conv } = await supabase
    .from("conversations")
    .select("id, candidato_id, empresa_id")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!conv?.candidato_id) {
    return NextResponse.json(
      { error: "sem_mensagens", message: "Conversa não encontrada ou sem candidato." },
      { status: 404 },
    );
  }

  const { data: cand } = await supabase
    .from("candidatos")
    .select(
      "id, empresa_id, etapa_id, unidade_id, nome, telefone, vaga_interesse, idade, cep, endereco, tem_veiculo, tags, notas_internas",
    )
    .eq("id", conv.candidato_id)
    .maybeSingle();
  if (!cand) {
    return NextResponse.json({ error: "sem_mensagens", message: "Candidato não encontrado." }, { status: 422 });
  }
  // Defesa em profundidade: usuário comum só age na própria empresa; escritas são
  // carimbadas com cand.empresa_id (não a do ator).
  if (!profile.platform_admin && cand.empresa_id !== profile.empresa_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Cargo da análise: explícito > match pela vaga de interesse > geral.
  let cargo: CargoIa | null = null;
  if (parsed.data.cargoId) {
    const { data: row } = await supabase
      .from("ia_cargos")
      .select("id, nome, criterios")
      .eq("id", parsed.data.cargoId)
      .eq("empresa_id", cand.empresa_id)
      .maybeSingle();
    if (!row) return erroJson("cargo_indefinido");
    const c = criteriosCargoSchema.safeParse(row.criterios);
    cargo = { id: row.id, nome: row.nome, criterios: c.success ? c.data : criteriosCargoSchema.parse({}) };
  } else {
    const cargos = await listCargosIa(cand.empresa_id);
    const resolvido = resolverCargo(cargos, cand.vaga_interesse);
    if (resolvido.tipo === "ambiguo") return erroJson("cargo_indefinido");
    cargo = resolvido.tipo === "match" || resolvido.tipo === "unico" ? resolvido.cargo : null;
  }

  // Config de IA (service role: a API key não tem grant p/ authenticated).
  const admin = createAdminClient();
  const cfg = await getIaConfig(admin, cand.empresa_id);
  let llm;
  try {
    llm = getLlmProvider(cfg);
  } catch (err) {
    if (err instanceof LlmError && err.code === "chave_invalida") return erroJson("chave_invalida");
    throw err;
  }

  const baixar = async (path: string): Promise<{ buffer: Buffer; mime: string } | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return { buffer: Buffer.from(await data.arrayBuffer()), mime: data.type || "application/octet-stream" };
  };

  const deps: PerfilDeps = {
    getMensagens: async (conversationId) => {
      // mais recentes primeiro + reverse: conversas gigantes mantêm a cauda recente.
      const { data } = await supabase
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
      excedido: limiteExcedido(await tokensUsadosNoMes(admin, cand.empresa_id), cfg.limiteTokensMes),
    }),
    transcreverPendentes: async (audios) => {
      // Provider mock: sem transcrição (placeholders) — e2e/dev sem chave funciona.
      if (cfg.provider !== "openai" || !cfg.apiKey) {
        return { porMensagem: new Map<string, string>(), tokens: 0 };
      }
      const apiKey = cfg.apiKey;
      return transcreverPendentes(audios, {
        baixarAudio: baixar,
        transcrever: (audio) => transcreverAudio({ apiKey }, audio),
        salvarCache: async (messageId, texto) => {
          const { error } = await supabase.from("messages").update({ transcricao: texto }).eq("id", messageId);
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
    llmJson: (system, user, opts) => llm.completeJson(system, user, opts),
    persist: async (candidatoId, score, parecer) => {
      const { error } = await supabase
        .from("candidatos")
        .update({
          score_ia: score,
          parecer_ia: { ...parecer, cargo: cargo?.nome ?? null } as unknown as Record<string, unknown>,
        })
        .eq("id", candidatoId);
      return { error };
    },
    registrarAnalise: async (log) => {
      const { error } = await supabase.from("cv_analises").insert({
        empresa_id: cand.empresa_id,
        candidato_id: cand.id,
        message_id: null,
        conversation_id: conv.id,
        origem: "perfil",
        cargo_nome: cargo?.nome ?? null,
        score: log.score,
        parecer: (log.parecer as unknown as Record<string, unknown>) ?? null,
        modelo: llm.modelo,
        tokens_est: log.tokensEst,
        tokens_in: log.tokensIn,
        tokens_out: log.tokensOut,
        custo_usd:
          log.tokensIn !== null && log.tokensOut !== null
            ? custoUsd(llm.modelo, log.tokensIn, log.tokensOut)
            : null,
        status: log.status,
        movido_por: profile.id,
      });
      return { error };
    },
    moverParaAnaliseConcluida: (candidatoId) =>
      moverParaIaConcluida(
        { empresaId: cand.empresa_id, candidatoId, etapaAtualId: cand.etapa_id },
        {
          getFunilDefault: async (empresaId) => {
            // SP7: funil da UNIDADE do candidato (se houver), senão o Geral.
            if (cand.unidade_id) {
              const { data: daUnidade } = await supabase
                .from("funis")
                .select("id")
                .eq("empresa_id", empresaId)
                .eq("unidade_id", cand.unidade_id)
                .eq("ativo", true)
                .maybeSingle();
              if (daUnidade) return daUnidade;
            }
            const { data } = await supabase
              .from("funis")
              .select("id")
              .eq("empresa_id", empresaId)
              .eq("is_default", true)
              .maybeSingle();
            return data ?? null;
          },
          getEtapas: async (funilId) => {
            const { data } = await supabase
              .from("funil_etapas")
              .select("id, nome, ordem, marcador")
              .eq("funil_id", funilId)
              .order("ordem", { ascending: true });
            return data ?? [];
          },
          updateEtapa: async (cId, etapaId) => {
            const { error } = await supabase
              .from("candidatos")
              .update({ etapa_id: etapaId, etapa_entrou_em: new Date().toISOString() })
              .eq("id", cId);
            return { error };
          },
          insertHistory: async (row) => {
            const { error } = await supabase.from("kanban_history").insert({
              empresa_id: cand.empresa_id,
              candidato_id: cand.id,
              de_etapa: row.deEtapa,
              para_etapa: row.paraEtapa,
              movido_por: profile.id,
              observacao: row.observacao,
            });
            return { error };
          },
        },
      ),
  };

  let result;
  try {
    result = await analisarPerfil(
      {
        empresaId: cand.empresa_id,
        candidatoId: cand.id,
        conversationId: conv.id,
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
        movidoPor: profile.id,
      },
      deps,
    );
  } catch (err) {
    console.error("[perfil/analyze] erro inesperado:", err);
    return erroJson("persist_falhou");
  }

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      score: result.score,
      movido: result.movido,
      cargo: cargo?.nome ?? null,
    });
  }
  return erroJson(result.error);
}
