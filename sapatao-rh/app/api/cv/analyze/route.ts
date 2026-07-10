import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarCurriculo, type AnaliseDeps, type AnaliseErro } from "@/lib/cv/analise";
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
import { moverParaIaConcluida } from "@/lib/funil/mover-ia";
import { isAnalisavelCv } from "@/lib/whatsapp/media-helpers";
import { analyzeSchema } from "@/lib/validations/cv";
import { PARECER_JSON_SCHEMA, type Parecer } from "@/lib/cv/parecer";

export const runtime = "nodejs"; // pdf-parse / mammoth precisam do runtime Node
export const maxDuration = 120;

const BUCKET = "whatsapp-media";

const ERRO_HTTP: Record<AnaliseErro | "limite_excedido" | "cargo_indefinido", { status: number; message: string }> = {
  arquivo_invalido: { status: 422, message: "Não foi possível ler o arquivo. Envie o currículo em PDF ou DOCX." },
  texto_vazio: { status: 422, message: "O currículo não contém texto legível para análise." },
  cargo_indefinido: {
    status: 422,
    message: "Defina a vaga de interesse do candidato ou analise pelo painel do chat escolhendo o cargo.",
  },
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
  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "bad_request", message: "messageId inválido." }, { status: 400 });
  }

  const supabase = await createClient();

  // mensagem -> anexo + conversa (RLS escopa por empresa)
  const { data: msg } = await supabase
    .from("messages")
    .select("midia_url, midia_mime, conversation_id")
    .eq("id", parsed.data.messageId)
    .maybeSingle();
  if (!msg || !msg.midia_url || !isAnalisavelCv(msg.midia_mime)) {
    return NextResponse.json(
      { error: "arquivo_invalido", message: "Mensagem sem currículo analisável (PDF ou DOCX)." },
      { status: 422 },
    );
  }

  const { data: conv } = await supabase
    .from("conversations")
    .select("candidato_id")
    .eq("id", msg.conversation_id ?? "")
    .maybeSingle();
  if (!conv?.candidato_id) {
    return NextResponse.json({ error: "arquivo_invalido", message: "Conversa sem candidato." }, { status: 422 });
  }

  const { data: cand } = await supabase
    .from("candidatos")
    .select("id, empresa_id, vaga_interesse, etapa_id, unidade_id")
    .eq("id", conv.candidato_id)
    .maybeSingle();
  if (!cand) {
    return NextResponse.json({ error: "arquivo_invalido", message: "Candidato não encontrado." }, { status: 422 });
  }
  // Defesa em profundidade (espelha send/send-media): usuário comum só age na própria
  // empresa. Toda escrita abaixo é carimbada com cand.empresa_id (não a do ator).
  if (!profile.platform_admin && cand.empresa_id !== profile.empresa_id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Cargo da análise (SP3b): explícito > match pela vaga de interesse > geral.
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

  // Config de IA da empresa (service role: a API key não tem grant p/ authenticated).
  const admin = createAdminClient();
  const cfg = await getIaConfig(admin, cand.empresa_id);
  let llm;
  try {
    llm = getLlmProvider(cfg);
  } catch (err) {
    if (err instanceof LlmError && err.code === "chave_invalida") return erroJson("chave_invalida");
    throw err;
  }

  // Limite mensal ANTES de qualquer chamada paga.
  if (limiteExcedido(await tokensUsadosNoMes(admin, cand.empresa_id), cfg.limiteTokensMes)) {
    return erroJson("limite_excedido");
  }

  const deps: AnaliseDeps = {
    getCvFile: async (path) => {
      const { data, error } = await supabase.storage.from(BUCKET).download(path);
      if (error || !data) return null;
      const buffer = Buffer.from(await data.arrayBuffer());
      return { buffer, mime: msg.midia_mime ?? "application/octet-stream" };
    },
    extractText: extractCvText,
    getCriterios,
    llmJson: (system, user) => llm.completeJson(system, user, { jsonSchema: PARECER_JSON_SCHEMA }),
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
      const tokensIn = log.tokensIn ?? null;
      const tokensOut = log.tokensOut ?? null;
      const { error } = await supabase.from("cv_analises").insert({
        empresa_id: cand.empresa_id, // carimba a empresa do candidato (não a do ator)
        candidato_id: cand.id,
        message_id: parsed.data.messageId,
        conversation_id: msg.conversation_id,
        origem: "cv",
        cargo_nome: cargo?.nome ?? null,
        score: log.score,
        parecer: (log.parecer as unknown as Record<string, unknown>) ?? null,
        modelo: llm.modelo,
        tokens_est: log.tokensEst,
        tokens_in: tokensIn,
        tokens_out: tokensOut,
        custo_usd:
          tokensIn !== null && tokensOut !== null ? custoUsd(llm.modelo, tokensIn, tokensOut) : null,
        status: log.status,
        movido_por: profile.id,
      });
      return { error };
    },
    moverParaAnaliseConcluida: async (candidatoId) => {
      await moverParaIaConcluida(
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
      );
    },
  };

  let result;
  try {
    result = await analisarCurriculo(
      {
        empresaId: cand.empresa_id,
        candidatoId: cand.id,
        cvPath: msg.midia_url,
        vagaInteresse: cand.vaga_interesse,
        cargo,
        movidoPor: profile.id,
      },
      deps,
    );
  } catch (err) {
    // Nenhum caminho deve vazar um 500 não-mapeado.
    console.error("[cv/analyze] erro inesperado:", err);
    return erroJson("persist_falhou");
  }

  if (result.ok) {
    return NextResponse.json({
      ok: true,
      score: result.score,
      parecer: result.parecer satisfies Parecer,
      cargo: cargo?.nome ?? null,
    });
  }
  return erroJson(result.error);
}
