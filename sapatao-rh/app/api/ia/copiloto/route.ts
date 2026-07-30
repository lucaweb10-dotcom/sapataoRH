import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  perguntarAoCopiloto,
  MAX_TURNOS_THREAD,
  type CopilotoDeps,
  type CopilotoErro,
} from "@/lib/copiloto/chat";
import type { CandidatoContexto } from "@/lib/copiloto/contexto";
import { getLlmProvider } from "@/lib/llm/factory";
import { getIaConfig } from "@/lib/llm/config";
import { LlmError } from "@/lib/llm/types";
import { limiteExcedido, tokensUsadosNoMes } from "@/lib/llm/limite";
import { custoUsd } from "@/lib/llm/modelos";
import { copilotoPerguntaSchema } from "@/lib/validations/copiloto";
import type { Message } from "@/types/database";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Mensagens da conversa levadas ao contexto (as mais recentes). */
const MAX_MENSAGENS = 300;

const ERRO_HTTP: Record<CopilotoErro, { status: number; message: string }> = {
  pergunta_vazia: { status: 400, message: "Escreva uma pergunta." },
  limite_excedido: {
    status: 429,
    message: "Limite mensal de tokens de IA da empresa atingido. Ajuste em Configurações → IA.",
  },
  chave_invalida: {
    status: 422,
    message: "Chave da OpenAI ausente ou inválida. Configure em Configurações → IA.",
  },
  ia_indisponivel: { status: 502, message: "A IA está indisponível no momento. Tente novamente." },
  resposta_vazia: { status: 502, message: "A IA não retornou resposta. Tente novamente." },
};

export async function POST(req: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "rh" && !profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = copilotoPerguntaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "Pergunta inválida." }, { status: 400 });
  }
  const { candidatoId, pergunta } = parsed.data;

  const supabase = await createClient();
  const { data: cand } = await supabase
    .from("candidatos")
    .select(
      "id, empresa_id, nome, telefone, idade, endereco, cep, tem_veiculo, vaga_interesse, status, tags, score_ia, parecer_ia, curriculo_url, notas_internas, etapa_id, unidade_id",
    )
    .eq("id", candidatoId)
    .maybeSingle();
  if (!cand) {
    return NextResponse.json({ error: "not_found", message: "Candidato não encontrado." }, { status: 404 });
  }
  if (!profile.platform_admin && cand.empresa_id !== profile.empresa_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const cfg = await getIaConfig(admin, cand.empresa_id);
  let llm;
  try {
    llm = getLlmProvider(cfg);
  } catch (err) {
    if (err instanceof LlmError && err.code === "chave_invalida") {
      const e = ERRO_HTTP.chave_invalida;
      return NextResponse.json({ error: "chave_invalida", message: e.message }, { status: e.status });
    }
    throw err;
  }

  const deps: CopilotoDeps = {
    getThread: async () => {
      const { data } = await supabase
        .from("ia_copiloto_mensagens")
        .select("role, conteudo")
        .eq("candidato_id", cand.id)
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false })
        .limit(MAX_TURNOS_THREAD);
      return (data ?? []).reverse().map((m) => ({ role: m.role, conteudo: m.conteudo }));
    },

    getCandidato: async () => {
      const [etapa, unidade] = await Promise.all([
        cand.etapa_id
          ? supabase.from("funil_etapas").select("nome").eq("id", cand.etapa_id).maybeSingle()
          : Promise.resolve({ data: null }),
        cand.unidade_id
          ? supabase.from("unidades").select("nome").eq("id", cand.unidade_id).maybeSingle()
          : Promise.resolve({ data: null }),
      ]);
      const ctx: CandidatoContexto = {
        nome: cand.nome ?? "não informado",
        telefone: cand.telefone,
        idade: cand.idade,
        endereco: cand.endereco,
        cep: cand.cep,
        tem_veiculo: cand.tem_veiculo,
        vaga_interesse: cand.vaga_interesse,
        status: cand.status,
        tags: cand.tags ?? [],
        score_ia: cand.score_ia,
        parecer_ia: cand.parecer_ia,
        curriculo_url: cand.curriculo_url,
        etapa_nome: etapa.data?.nome ?? null,
        unidade_nome: unidade.data?.nome ?? null,
        notas_internas: cand.notas_internas,
      };
      return ctx;
    },

    getMensagens: async () => {
      const { data: conv } = await supabase
        .from("conversations")
        .select("id")
        .eq("candidato_id", cand.id)
        .maybeSingle();
      if (!conv) return [];
      const { data } = await supabase
        .from("messages")
        .select("id, direction, tipo, conteudo, midia_mime, metadata, transcricao, created_at")
        .eq("conversation_id", conv.id)
        .order("created_at", { ascending: false })
        .limit(MAX_MENSAGENS);
      const rows = (data ?? []) as Pick<
        Message,
        "id" | "direction" | "tipo" | "conteudo" | "midia_mime" | "metadata" | "transcricao" | "created_at"
      >[];
      return rows.reverse();
    },

    checarLimite: async () => ({
      excedido: limiteExcedido(await tokensUsadosNoMes(admin, cand.empresa_id), cfg.limiteTokensMes),
    }),

    completeChat: (system, mensagens) => llm.completeChat(system, mensagens),

    persistir: async (perguntaTexto, resposta) => {
      // Service role: ia_copiloto_mensagens não tem policy de insert p/ authenticated.
      await admin.from("ia_copiloto_mensagens").insert([
        {
          empresa_id: cand.empresa_id,
          candidato_id: cand.id,
          user_id: profile.id,
          role: "user",
          conteudo: perguntaTexto,
        },
        {
          empresa_id: cand.empresa_id,
          candidato_id: cand.id,
          user_id: profile.id,
          role: "assistant",
          conteudo: resposta,
        },
      ]);
    },

    registrarUso: async (uso) => {
      await admin.from("ia_uso").insert({
        empresa_id: cand.empresa_id,
        tipo: "copiloto",
        candidato_id: cand.id,
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
  };

  let result;
  try {
    result = await perguntarAoCopiloto(pergunta, deps);
  } catch (err) {
    console.error("[ia/copiloto] erro inesperado:", err);
    return NextResponse.json({ error: "ia_indisponivel", message: ERRO_HTTP.ia_indisponivel.message }, { status: 502 });
  }

  if (result.ok) return NextResponse.json({ ok: true, resposta: result.resposta });
  const e = ERRO_HTTP[result.error];
  return NextResponse.json({ error: result.error, message: e.message }, { status: e.status });
}
