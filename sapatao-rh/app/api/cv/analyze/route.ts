import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { analisarCurriculo, type AnaliseDeps, type AnaliseErro } from "@/lib/cv/analise";
import { extractCvText } from "@/lib/cv/extract-text";
import { getCriterios } from "@/lib/cv/criterios";
import { getLlmProvider } from "@/lib/llm/factory";
import { isAnalisavelCv } from "@/lib/whatsapp/media-helpers";
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
    .select("id, empresa_id, vaga_interesse, etapa_id")
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
        empresa_id: cand.empresa_id, // carimba a empresa do candidato (não a do ator)
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
      // Resolve o funil padrão DO CANDIDATO (não o do ator) p/ o move forward-only.
      const { data: funil } = await supabase
        .from("funis")
        .select("id")
        .eq("empresa_id", cand.empresa_id)
        .eq("is_default", true)
        .maybeSingle();
      if (!funil) return;
      const { data: etapas } = await supabase
        .from("funil_etapas")
        .select("id, nome, ordem, marcador")
        .eq("funil_id", funil.id)
        .order("ordem", { ascending: true });
      // marcador estável (SP2b) com fallback pelo nome (resiliente a rename)
      const alvo = etapas?.find((e) => e.marcador === "ia_concluida") ?? etapas?.find((e) => e.nome === ETAPA_ALVO);
      if (!alvo) return;
      const atual = cand.etapa_id ? etapas?.find((e) => e.id === cand.etapa_id) : null;
      // conservador: se o candidato tem etapa mas ela não está neste funil, não move.
      if (cand.etapa_id && !atual) return;
      // forward-only: não retrocede um card já adiantado.
      if (atual && atual.ordem >= alvo.ordem) return;
      await supabase
        .from("candidatos")
        .update({ etapa_id: alvo.id, etapa_entrou_em: new Date().toISOString() })
        .eq("id", candidatoId);
      await supabase.from("kanban_history").insert({
        empresa_id: cand.empresa_id,
        candidato_id: candidatoId,
        de_etapa: cand.etapa_id,
        para_etapa: alvo.id,
        movido_por: profile.id,
        observacao: "Movido pela análise de IA",
      });
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
        movidoPor: profile.id,
      },
      deps,
    );
  } catch (err) {
    // Nenhum caminho deve vazar um 500 não-mapeado.
    console.error("[cv/analyze] erro inesperado:", err);
    return NextResponse.json(
      { error: "persist_falhou", message: ERRO_HTTP.persist_falhou.message },
      { status: 500 },
    );
  }

  if (result.ok) {
    return NextResponse.json({ ok: true, score: result.score, parecer: result.parecer satisfies Parecer });
  }
  const e = ERRO_HTTP[result.error];
  return NextResponse.json({ error: result.error, message: e.message }, { status: e.status });
}
