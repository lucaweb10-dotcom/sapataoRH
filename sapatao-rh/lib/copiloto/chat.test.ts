import { describe, it, expect, vi } from "vitest";
import { perguntarAoCopiloto, MAX_TURNOS_THREAD, type CopilotoDeps } from "./chat";
import { LlmError, type LlmChatMsg } from "@/lib/llm/types";
import type { CandidatoContexto } from "./contexto";

const CANDIDATO: CandidatoContexto = {
  nome: "Maria Silva",
  telefone: "5551999990000",
  idade: 24,
  endereco: "Rua A, 100",
  cep: "90000-000",
  tem_veiculo: true,
  vaga_interesse: "Frentista",
  status: "ativo",
  tags: ["indicação"],
  score_ia: 78,
  parecer_ia: { resumo: "Perfil aderente." },
  curriculo_url: "curriculos/maria.pdf",
  etapa_nome: "Triagem",
  unidade_nome: "Centro",
  notas_internas: null,
};

function deps(over: Partial<CopilotoDeps> = {}): CopilotoDeps {
  return {
    getThread: async () => [],
    getCandidato: async () => CANDIDATO,
    getMensagens: async () => [],
    checarLimite: async () => ({ excedido: false }),
    completeChat: async () => ({ texto: "Resposta da IA.", tokensEst: 120, tokensIn: 100, tokensOut: 20 }),
    persistir: async () => {},
    registrarUso: async () => {},
    ...over,
  };
}

describe("perguntarAoCopiloto", () => {
  it("responde e grava o par pergunta/resposta", async () => {
    const persistir = vi.fn<(p: string, r: string) => Promise<void>>(async () => {});
    const r = await perguntarAoCopiloto("Ela tem experiência?", deps({ persistir }));

    expect(r).toEqual({ ok: true, resposta: "Resposta da IA.", tokensEst: 120 });
    expect(persistir).toHaveBeenCalledWith("Ela tem experiência?", "Resposta da IA.");
  });

  it("rejeita pergunta vazia sem chamar a IA", async () => {
    const completeChat = vi.fn();
    const r = await perguntarAoCopiloto("   ", deps({ completeChat }));

    expect(r).toEqual({ ok: false, error: "pergunta_vazia" });
    expect(completeChat).not.toHaveBeenCalled();
  });

  it("para no limite mensal antes de gastar token", async () => {
    const completeChat = vi.fn();
    const r = await perguntarAoCopiloto("oi", deps({ checarLimite: async () => ({ excedido: true }), completeChat }));

    expect(r).toEqual({ ok: false, error: "limite_excedido" });
    expect(completeChat).not.toHaveBeenCalled();
  });

  it("manda o contexto do candidato como primeira mensagem", async () => {
    let recebidas: LlmChatMsg[] = [];
    await perguntarAoCopiloto(
      "resume",
      deps({
        completeChat: async (_s, mensagens) => {
          recebidas = mensagens;
          return { texto: "ok", tokensEst: 1 };
        },
      }),
    );

    expect(recebidas[0].role).toBe("user");
    expect(recebidas[0].conteudo).toContain("Maria Silva");
    expect(recebidas[0].conteudo).toContain("Frentista");
    expect(recebidas.at(-1)).toEqual({ role: "user", conteudo: "resume" });
  });

  it("corta a thread nos últimos turnos para o custo não crescer sem fim", async () => {
    const thread: LlmChatMsg[] = Array.from({ length: MAX_TURNOS_THREAD + 6 }, (_, i) => ({
      role: i % 2 === 0 ? ("user" as const) : ("assistant" as const),
      conteudo: `turno ${i}`,
    }));
    let recebidas: LlmChatMsg[] = [];
    await perguntarAoCopiloto(
      "e agora?",
      deps({
        getThread: async () => thread,
        completeChat: async (_s, mensagens) => {
          recebidas = mensagens;
          return { texto: "ok", tokensEst: 1 };
        },
      }),
    );

    // contexto + âncora do assistant + MAX_TURNOS_THREAD + pergunta atual
    expect(recebidas).toHaveLength(MAX_TURNOS_THREAD + 3);
    expect(recebidas.some((m) => m.conteudo === "turno 0")).toBe(false);
  });

  it("mapeia chave inválida e registra o uso mesmo falhando", async () => {
    const registrarUso = vi.fn<(u: { status: string }) => Promise<void>>(async () => {});
    const r = await perguntarAoCopiloto(
      "oi",
      deps({
        completeChat: async () => {
          throw new LlmError("chave_invalida");
        },
        registrarUso,
      }),
    );

    expect(r).toEqual({ ok: false, error: "chave_invalida" });
    expect(registrarUso).toHaveBeenCalledWith(expect.objectContaining({ status: "chave_invalida" }));
  });

  it("trata falha de rede como ia_indisponivel", async () => {
    const r = await perguntarAoCopiloto(
      "oi",
      deps({
        completeChat: async () => {
          throw new Error("socket hang up");
        },
      }),
    );
    expect(r).toEqual({ ok: false, error: "ia_indisponivel" });
  });

  it("resposta em branco vira erro em vez de bolha vazia", async () => {
    const r = await perguntarAoCopiloto(
      "oi",
      deps({ completeChat: async () => ({ texto: "   ", tokensEst: 5 }) }),
    );
    expect(r).toEqual({ ok: false, error: "resposta_vazia" });
  });

  it("não perde a resposta se o histórico falhar ao gravar", async () => {
    const r = await perguntarAoCopiloto(
      "oi",
      deps({
        persistir: async () => {
          throw new Error("db fora");
        },
      }),
    );
    expect(r.ok).toBe(true);
  });
});
