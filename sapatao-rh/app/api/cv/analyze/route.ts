import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { analisarCurriculo, type AnaliseDeps, type AnaliseErro } from "@/lib/cv/analise";
import { extractCvText } from "@/lib/cv/extract-text";
import { getCriterios } from "@/lib/cv/criterios";
import { getLlmProvider } from "@/lib/llm/factory";
import { getFunilComEtapas } from "@/lib/funil/queries";
import { isCurriculoDoc } from "@/lib/whatsapp/media-helpers";
import { analyzeSchema } from "@/lib/validations/cv";
import type { Parecer } from "@/lib/cv/parecer";

export const runtime = "nodejs"; // pdf-parse / mammoth precisam do runtime Node

const BUCKET = "whatsapp-media";
const ETAPA_ALVO = "Análise IA Concluída";

const ERRO_HTTP: Record<AnaliseErro, { status: number; message: string }> = {
  arquivo_invalido: { status: 422, message: "Não foi possível ler o arquivo. Envie o currículo em PDF ou DOCX." },
  texto_vazio: { status: 422, message: "O currículo não contém texto legível para análise." },
  ia_indisponivel: { status: 502, message: "A IA está indisponível no momento. Tente novamente." },
  parecer_invalido: { status: 502, message: "A IA retornou um resultado inválido. Tente novamente." },
  persist_falhou: { status: 500, message: "Falha ao salvar a análise. Tente novamente." },
};

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
  if (!msg || !msg.midia_url || !isCurriculoDoc(msg.midia_mime)) {
    return NextResponse.json(
      { error: "arquivo_invalido", message: "Mensagem sem currículo (PDF/DOCX) para analisar." },
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
    .select("id, empresa_id, vaga_interesse, etapa_id")
    .eq("id", conv.candidato_id)
    .maybeSingle();
  if (!cand) {
    return NextResponse.json({ error: "arquivo_invalido", message: "Candidato não encontrado." }, { status: 422 });
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
    llmJson: (system, user) => getLlmProvider().completeJson(system, user),
    persist: async (candidatoId, score, parecer) => {
      const { error } = await supabase
        .from("candidatos")
        .update({ score_ia: score, parecer_ia: parecer as unknown as Record<string, unknown> })
        .eq("id", candidatoId);
      return { error };
    },
    registrarAnalise: async (log) => {
      const { error } = await supabase.from("cv_analises").insert({
        empresa_id: profile.empresa_id,
        candidato_id: cand.id,
        message_id: parsed.data.messageId,
        score: log.score,
        parecer: (log.parecer as unknown as Record<string, unknown>) ?? null,
        modelo: getLlmProvider().modelo,
        tokens_est: log.tokensEst,
        status: log.status,
        movido_por: profile.id,
      });
      return { error };
    },
    moverParaAnaliseConcluida: async (candidatoId) => {
      const funil = await getFunilComEtapas();
      const alvo = funil?.etapas.find((e) => e.nome === ETAPA_ALVO);
      if (!alvo) return;
      const atual = funil!.etapas.find((e) => e.id === cand.etapa_id);
      // forward-only: não retrocede um card já adiantado
      if (atual && atual.ordem >= alvo.ordem) return;
      await supabase
        .from("candidatos")
        .update({ etapa_id: alvo.id, etapa_entrou_em: new Date().toISOString() })
        .eq("id", candidatoId);
      await supabase.from("kanban_history").insert({
        empresa_id: profile.empresa_id,
        candidato_id: candidatoId,
        de_etapa: cand.etapa_id,
        para_etapa: alvo.id,
        movido_por: profile.id,
        observacao: "Movido pela análise de IA",
      });
    },
  };

  const result = await analisarCurriculo(
    {
      empresaId: profile.empresa_id,
      candidatoId: cand.id,
      cvPath: msg.midia_url,
      vagaInteresse: cand.vaga_interesse,
      movidoPor: profile.id,
    },
    deps,
  );

  if (result.ok) {
    return NextResponse.json({ ok: true, score: result.score, parecer: result.parecer satisfies Parecer });
  }
  const e = ERRO_HTTP[result.error];
  return NextResponse.json({ error: result.error, message: e.message }, { status: e.status });
}
