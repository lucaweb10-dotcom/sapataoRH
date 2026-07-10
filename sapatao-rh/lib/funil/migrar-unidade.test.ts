import { describe, it, expect } from "vitest";
import { mapearEtapaEquivalente, statusAposMigracao, type EtapaMapeavel } from "./migrar-unidade";

const e = (
  id: string,
  nome: string,
  ordem: number,
  marcador: string | null = null,
  is_terminal = false,
  status_destino: string | null = null,
): EtapaMapeavel => ({ id, nome, ordem, marcador, is_terminal, status_destino });

const origem: EtapaMapeavel[] = [
  e("o1", "Novo Lead", 1),
  e("o2", "Triagem Inicial", 2),
  e("o3", "Análise IA Concluída", 3, "ia_concluida"),
  e("o4", "Entrevista Agendada", 4),
  e("o5", "Contratado", 5, null, true, "contratado"),
];

const destino: EtapaMapeavel[] = [
  e("d1", "Novo Lead", 1),
  e("d2", "Triagem inicial", 2), // caixa diferente
  e("d3", "IA feita", 3, "ia_concluida"), // renomeada, marcador igual
  e("d4", "Papo com gestor", 4), // nome diferente
  e("d5", "Contratado", 5, null, true, "contratado"),
];

describe("mapearEtapaEquivalente", () => {
  it("marcador tem prioridade sobre nome (etapa de sistema renomeada)", () => {
    expect(mapearEtapaEquivalente("o3", origem, destino)).toBe("d3");
  });

  it("casa por nome normalizado (caixa/acento)", () => {
    expect(mapearEtapaEquivalente("o2", origem, destino)).toBe("d2");
  });

  it("sem marcador nem nome → mesma posição entre as NÃO-terminais", () => {
    expect(mapearEtapaEquivalente("o4", origem, destino)).toBe("d4");
  });

  it("posição clampada NUNCA aterrissa em etapa terminal", () => {
    // destino curto: 1 não-terminal + 1 terminal — o4 (posição 4) clampa na última NÃO-terminal
    const curto = [e("d1", "Novo Lead", 1), e("dT", "Contratado", 2, null, true, "contratado")];
    expect(mapearEtapaEquivalente("o4", origem, curto)).toBe("d1");
  });

  it("terminal casa por nome (Contratado → Contratado)", () => {
    expect(mapearEtapaEquivalente("o5", origem, destino)).toBe("d5");
  });

  it("terminal SEM equivalente → null (não re-encaixa no pipeline)", () => {
    const semTerminal = [e("d1", "Novo Lead", 1), e("d2", "Outra", 2)];
    expect(mapearEtapaEquivalente("o5", origem, semTerminal)).toBeNull();
  });

  it("etapa atual null → 1ª etapa NÃO-terminal do destino", () => {
    expect(mapearEtapaEquivalente(null, origem, destino)).toBe("d1");
  });

  it("etapa já pertence ao destino → mantém (não move)", () => {
    expect(mapearEtapaEquivalente("d2", origem, destino)).toBe("d2");
  });

  it("etapa desconhecida na origem → 1ª etapa não-terminal do destino", () => {
    expect(mapearEtapaEquivalente("zzz", origem, destino)).toBe("d1");
  });

  it("destino sem etapas → null", () => {
    expect(mapearEtapaEquivalente("o1", origem, [])).toBeNull();
  });

  it("ordena por ordem (não confia na ordem do array)", () => {
    const bagunçado = [...destino].reverse();
    expect(mapearEtapaEquivalente(null, origem, bagunçado)).toBe("d1");
  });
});

describe("statusAposMigracao", () => {
  it("etapa terminal → status_destino", () => {
    expect(statusAposMigracao(e("x", "Contratado", 9, null, true, "contratado"))).toBe("contratado");
  });
  it("etapa não-terminal → ativo (status é total)", () => {
    expect(statusAposMigracao(e("x", "Triagem", 2))).toBe("ativo");
  });
  it("sem etapa → null (não mexe)", () => {
    expect(statusAposMigracao(undefined)).toBeNull();
  });
});
