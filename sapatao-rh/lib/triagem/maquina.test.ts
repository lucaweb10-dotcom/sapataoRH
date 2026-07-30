import { describe, it, expect, vi } from "vitest";
import { processarTurno, type TriagemDeps, type EstadoTriagem } from "./maquina";
import { TRIAGEM_CONFIG_PADRAO } from "./config";
import { LlmError } from "@/lib/llm/types";
import type { Turno } from "./turno";

/** 12:00 em São Paulo — dentro da janela padrão (8h às 20h). */
const AGORA = new Date("2026-07-30T15:00:00Z");
/** 03:00 em São Paulo. */
const MADRUGADA = new Date("2026-07-30T06:00:00Z");

const ESTADO: EstadoTriagem = { ativa: true, estado: "perguntando", passo: 0, turnos: 2 };

const CAMPOS_VAZIOS: Turno["campos"] = {
  vaga_interesse: null,
  idade: null,
  tem_veiculo: null,
  endereco: null,
  disponibilidade: null,
  experiencia: null,
};

function turnoJson(over: Partial<Turno> = {}): string {
  return JSON.stringify({
    mensagem: "legal, qual função te interessa?",
    proximo_estado: "perguntando",
    campos: CAMPOS_VAZIOS,
    intencao: "normal",
    motivo_handoff: null,
    ...over,
  });
}

function deps(over: Partial<TriagemDeps> = {}) {
  const base: TriagemDeps = {
    carregarEstado: async () => ({ ...ESTADO }),
    claim: async () => true,
    liberarClaim: async () => {},
    salvarEstado: async () => {},
    empresaAtiva: async () => true,
    gestorAssumiu: async () => false,
    contarMensagensIa: async () => 0,
    optedOut: async () => false,
    checarLimite: async () => ({ excedido: false }),
    carregarMensagens: async () => [],
    montarTranscript: () => "[30/07/2026 12:00] Candidato: oi, tem vaga?",
    getCargos: async () => ["Frentista"],
    llmJson: async () => ({ json: turnoJson(), tokensEst: 800, tokensIn: 700, tokensOut: 40 }),
    enviar: async () => ({ ok: true }),
    aplicarCampos: async () => {},
    registrarOptout: async () => {},
    concluir: async () => {},
    registrarUso: async () => {},
    avisarGestor: async () => {},
    ...over,
  };
  return base;
}

const input = (agora = AGORA) => ({
  cfg: TRIAGEM_CONFIG_PADRAO,
  contextoEmpresa: null,
  agora,
});

describe("processarTurno — caminho feliz", () => {
  it("envia exatamente UMA mensagem", async () => {
    const enviar = vi.fn<(t: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const r = await processarTurno(input(), deps({ enviar }));

    expect(r).toEqual({
      acao: "enviou",
      texto: "legal, qual função te interessa?",
      estado: "perguntando",
      concluiu: false,
    });
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("avança turno e passo, e limpa o agendamento", async () => {
    const salvarEstado = vi.fn(async () => {});
    await processarTurno(input(), deps({ salvarEstado }));

    expect(salvarEstado).toHaveBeenCalledWith(
      expect.objectContaining({ turnos: 3, passo: 1, responder_em: null }),
    );
  });

  it("dispara a análise ao concluir", async () => {
    const concluir = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => ({
          json: turnoJson({ mensagem: "recebi! o RH vai analisar e te retorna.", proximo_estado: "concluida" }),
          tokensEst: 10,
        }),
        concluir,
      }),
    );

    expect(concluir).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ acao: "enviou", estado: "concluida", concluiu: true });
  });

  it("grava no cadastro os campos que a pessoa informou", async () => {
    const aplicarCampos = vi.fn(async () => {});
    await processarTurno(
      input(),
      deps({
        llmJson: async () => ({
          json: turnoJson({
            campos: { ...CAMPOS_VAZIOS, vaga_interesse: "Frentista", idade: 24, tem_veiculo: true },
          }),
          tokensEst: 10,
        }),
        aplicarCampos,
      }),
    );

    expect(aplicarCampos).toHaveBeenCalledWith({
      vaga_interesse: "Frentista",
      idade: 24,
      tem_veiculo: true,
    });
  });
});

describe("travas anti-loop", () => {
  it("trava 7: kill switch da empresa cala a IA sem gastar token", async () => {
    const llmJson = vi.fn();
    const enviar = vi.fn();
    const r = await processarTurno(input(), deps({ empresaAtiva: async () => false, llmJson, enviar }));

    expect(r).toEqual({ acao: "silencio", motivo: "empresa_desligada" });
    expect(llmJson).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("trava 6: gestor assumiu desliga a triagem PARA SEMPRE nesta conversa", async () => {
    const salvarEstado = vi.fn(async () => {});
    const enviar = vi.fn();
    const r = await processarTurno(input(), deps({ gestorAssumiu: async () => true, salvarEstado, enviar }));

    expect(r).toEqual({ acao: "silencio", motivo: "gestor_assumiu" });
    expect(enviar).not.toHaveBeenCalled();
    expect(salvarEstado).toHaveBeenCalledWith(
      expect.objectContaining({ ativa: false, motivo_parada: "gestor_assumiu" }),
    );
  });

  it("trava 3: se outro worker pegou a claim, este não faz nada", async () => {
    const llmJson = vi.fn();
    const enviar = vi.fn();
    const r = await processarTurno(input(), deps({ claim: async () => false, llmJson, enviar }));

    expect(r).toEqual({ acao: "silencio", motivo: "ocupada" });
    expect(llmJson).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("trava 5: teto por hora pausa a conversa e avisa o gestor", async () => {
    const avisarGestor = vi.fn(async () => {});
    const salvarEstado = vi.fn(async () => {});
    const enviar = vi.fn();
    const r = await processarTurno(
      input(),
      deps({
        contarMensagensIa: async (janela) => (janela === 1 ? TRIAGEM_CONFIG_PADRAO.teto_hora : 0),
        avisarGestor,
        salvarEstado,
        enviar,
      }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "teto_hora" });
    expect(enviar).not.toHaveBeenCalled();
    expect(avisarGestor).toHaveBeenCalledWith("teto_hora");
    expect(salvarEstado).toHaveBeenCalledWith(
      expect.objectContaining({ estado: "pausada", ativa: false }),
    );
  });

  it("trava 5: teto por dia também pausa", async () => {
    const enviar = vi.fn();
    const r = await processarTurno(
      input(),
      deps({
        contarMensagensIa: async (janela) => (janela === 24 ? TRIAGEM_CONFIG_PADRAO.teto_dia : 0),
        enviar,
      }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "teto_dia" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("estado terminal não volta a responder", async () => {
    for (const estado of ["concluida", "handoff", "pausada"] as const) {
      const enviar = vi.fn();
      const r = await processarTurno(
        input(),
        deps({ carregarEstado: async () => ({ ...ESTADO, estado }), enviar }),
      );
      expect(r).toEqual({ acao: "silencio", motivo: "estado_terminal" });
      expect(enviar).not.toHaveBeenCalled();
    }
  });

  it("conversa sem triagem ligada é ignorada", async () => {
    const r = await processarTurno(input(), deps({ carregarEstado: async () => null }));
    expect(r).toEqual({ acao: "silencio", motivo: "triagem_inativa" });
  });

  it("max_turnos entrega para humano em vez de continuar", async () => {
    const enviar = vi.fn();
    const salvarEstado = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({
        carregarEstado: async () => ({ ...ESTADO, turnos: TRIAGEM_CONFIG_PADRAO.max_turnos }),
        enviar,
        salvarEstado,
      }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "max_turnos" });
    expect(enviar).not.toHaveBeenCalled();
    expect(salvarEstado).toHaveBeenCalledWith(expect.objectContaining({ estado: "handoff" }));
  });

  it("não manda mensagem de madrugada, e mantém o agendamento para depois", async () => {
    const enviar = vi.fn();
    const salvarEstado = vi.fn(async () => {});
    const r = await processarTurno(input(MADRUGADA), deps({ enviar, salvarEstado }));

    expect(r).toEqual({ acao: "silencio", motivo: "fora_do_horario" });
    expect(enviar).not.toHaveBeenCalled();
    // Nada de responder_em: null aqui, senão a conversa nunca mais seria retomada.
    expect(salvarEstado).not.toHaveBeenCalled();
  });

  it("respeita o opt-out do candidato", async () => {
    const enviar = vi.fn();
    const r = await processarTurno(input(), deps({ optedOut: async () => true, enviar }));

    expect(r).toEqual({ acao: "silencio", motivo: "optout" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("para no limite mensal de tokens", async () => {
    const llmJson = vi.fn();
    const r = await processarTurno(
      input(),
      deps({ checarLimite: async () => ({ excedido: true }), llmJson }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "limite_tokens" });
    expect(llmJson).not.toHaveBeenCalled();
  });

  it("libera a claim mesmo quando o turno estoura", async () => {
    const liberarClaim = vi.fn(async () => {});
    await expect(
      processarTurno(
        input(),
        deps({
          liberarClaim,
          carregarMensagens: async () => {
            throw new Error("banco fora");
          },
        }),
      ),
    ).rejects.toThrow("banco fora");
    expect(liberarClaim).toHaveBeenCalledTimes(1);
  });
});

describe("estilo da mensagem", () => {
  it("nunca envia mensagem com travessão: sanitiza antes", async () => {
    const enviar = vi.fn<(t: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => ({ json: turnoJson({ mensagem: "beleza — qual função?" }), tokensEst: 10 }),
        enviar,
      }),
    );

    expect(r).toMatchObject({ acao: "enviou" });
    expect(enviar).toHaveBeenCalledWith("beleza, qual função?");
    expect(enviar.mock.calls[0][0]).not.toMatch(/[—–]/);
  });

  it("tenta de novo quando o estilo não dá para consertar, e desiste calada", async () => {
    const llmJson = vi.fn(async () => ({
      json: turnoJson({ mensagem: "Prezado candidato, qual sua idade? e seu endereço?" }),
      tokensEst: 10,
    }));
    const enviar = vi.fn();
    const r = await processarTurno(input(), deps({ llmJson, enviar }));

    expect(llmJson).toHaveBeenCalledTimes(2);
    expect(r).toEqual({ acao: "silencio", motivo: "estilo_reprovado" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("aceita a segunda tentativa quando ela vem corrigida", async () => {
    let chamada = 0;
    const enviar = vi.fn<(t: string) => Promise<{ ok: boolean }>>(async () => ({ ok: true }));
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => {
          chamada++;
          return {
            json: turnoJson({
              mensagem: chamada === 1 ? "Prezado, qual sua idade? e o endereço?" : "qual sua idade?",
            }),
            tokensEst: 10,
          };
        },
        enviar,
      }),
    );

    expect(r).toMatchObject({ acao: "enviou", texto: "qual sua idade?" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe("falhas do modelo", () => {
  it("JSON inválido não vira mensagem", async () => {
    const enviar = vi.fn();
    const r = await processarTurno(
      input(),
      deps({ llmJson: async () => ({ json: "{isso não é json", tokensEst: 5 }), enviar }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "turno_invalido" });
    expect(enviar).not.toHaveBeenCalled();
  });

  it("chave inválida cala em vez de estourar", async () => {
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => {
          throw new LlmError("chave_invalida");
        },
      }),
    );
    expect(r).toEqual({ acao: "silencio", motivo: "chave_invalida" });
  });

  it("indisponibilidade da IA cala", async () => {
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => {
          throw new Error("timeout");
        },
      }),
    );
    expect(r).toEqual({ acao: "silencio", motivo: "ia_indisponivel" });
  });

  it("mensagem null é saída válida: fica calado e conta o turno", async () => {
    const enviar = vi.fn();
    const salvarEstado = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => ({ json: turnoJson({ mensagem: null }), tokensEst: 5 }),
        enviar,
        salvarEstado,
      }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "modelo_calou" });
    expect(enviar).not.toHaveBeenCalled();
    expect(salvarEstado).toHaveBeenCalledWith(expect.objectContaining({ turnos: 3 }));
  });

  it("falha de envio não avança o estado como se tivesse enviado", async () => {
    const salvarEstado = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({ enviar: async () => ({ ok: false }), salvarEstado }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "envio_falhou" });
    expect(salvarEstado).not.toHaveBeenCalledWith(expect.objectContaining({ turnos: 3 }));
  });
});

describe("pedido de parar", () => {
  it("registra opt-out e encerra a triagem", async () => {
    const registrarOptout = vi.fn(async () => {});
    const salvarEstado = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => ({
          json: turnoJson({ mensagem: "sem problema, obrigada!", intencao: "parar" }),
          tokensEst: 5,
        }),
        registrarOptout,
        salvarEstado,
      }),
    );

    expect(registrarOptout).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ acao: "enviou", estado: "handoff" });
    expect(salvarEstado).toHaveBeenCalledWith(expect.objectContaining({ ativa: false }));
  });

  it("pedido de parar sem despedida não manda nada", async () => {
    const enviar = vi.fn();
    const registrarOptout = vi.fn(async () => {});
    const r = await processarTurno(
      input(),
      deps({
        llmJson: async () => ({
          json: turnoJson({ mensagem: null, intencao: "parar" }),
          tokensEst: 5,
        }),
        enviar,
        registrarOptout,
      }),
    );

    expect(r).toEqual({ acao: "silencio", motivo: "modelo_calou" });
    expect(enviar).not.toHaveBeenCalled();
    expect(registrarOptout).toHaveBeenCalledTimes(1);
  });
});
