import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { analisarPerfil, type PerfilDeps, type PerfilErro } from "@/lib/perfil/analise";
import { montarPerfilDeps } from "@/lib/perfil/deps";
import { listCargosIa, resolverCargo, criteriosCargoSchema, type CargoIa } from "@/lib/cv/criterios";
import { getLlmProvider } from "@/lib/llm/factory";
import { getIaConfig } from "@/lib/llm/config";
import { LlmError } from "@/lib/llm/types";
import { perfilAnalyzeSchema } from "@/lib/validations/perfil";

export const runtime = "nodejs"; // mammoth/pdf precisam do runtime Node
export const maxDuration = 120; // transcrições + LLM podem passar de 30s na 1ª análise

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

  const deps: PerfilDeps = montarPerfilDeps(supabase, admin, {
    empresaId: cand.empresa_id,
    candidatoId: cand.id,
    conversationId: conv.id,
    etapaAtualId: cand.etapa_id,
    unidadeId: cand.unidade_id,
    cargo,
    movidoPor: profile.id,
    cfg,
    llm,
  });

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
