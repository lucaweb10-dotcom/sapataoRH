import { describe, it, expect, vi } from "vitest";
import {
  moverParaIaConcluida,
  OBSERVACAO_MOVE_IA,
  type EtapaResumo,
  type MoverIaDeps,
  type MoverIaInput,
} from "./mover-ia";

const etapas: EtapaResumo[] = [
  { id: "e-1", nome: "Novo Lead", ordem: 1, marcador: null },
  { id: "e-2", nome: "Triagem", ordem: 2, marcador: null },
  { id: "e-3", nome: "IA ok", ordem: 3, marcador: "ia_concluida" },
  { id: "e-4", nome: "Entrevista", ordem: 4, marcador: null },
];

function makeInput(over: Partial<MoverIaInput> = {}): MoverIaInput {
  return { empresaId: "emp-1", candidatoId: "c-1", etapaAtualId: "e-1", ...over };
}

function makeDeps(over: Partial<MoverIaDeps> = {}): MoverIaDeps {
  return {
    getFunilDefault: vi.fn(async () => ({ id: "f-1" })),
    getEtapas: vi.fn(async () => etapas),
    updateEtapa: vi.fn(async () => ({ error: null })),
    insertHistory: vi.fn(async () => ({ error: null })),
    ...over,
  };
}

describe("moverParaIaConcluida", () => {
  it("move pelo marcador 'ia_concluida' e registra histórico com a observação da IA", async () => {
    const deps = makeDeps();
    expect(await moverParaIaConcluida(makeInput(), deps)).toBe(true);
    expect(deps.updateEtapa).toHaveBeenCalledWith("c-1", "e-3");
    expect(deps.insertHistory).toHaveBeenCalledWith({
      deEtapa: "e-1",
      paraEtapa: "e-3",
      observacao: OBSERVACAO_MOVE_IA,
    });
    expect(OBSERVACAO_MOVE_IA).toBe("Movido pela análise de IA");
  });

  it("fallback pelo nome 'Análise IA Concluída' quando nenhum marcador existe", async () => {
    const semMarcador: EtapaResumo[] = [
      { id: "e-1", nome: "Novo Lead", ordem: 1, marcador: null },
      { id: "e-9", nome: "Análise IA Concluída", ordem: 3, marcador: null },
    ];
    const deps = makeDeps({ getEtapas: vi.fn(async () => semMarcador) });
    expect(await moverParaIaConcluida(makeInput(), deps)).toBe(true);
    expect(deps.updateEtapa).toHaveBeenCalledWith("c-1", "e-9");
  });

  it("sem funil default → false sem update", async () => {
    const deps = makeDeps({ getFunilDefault: vi.fn(async () => null) });
    expect(await moverParaIaConcluida(makeInput(), deps)).toBe(false);
    expect(deps.updateEtapa).not.toHaveBeenCalled();
    expect(deps.insertHistory).not.toHaveBeenCalled();
  });

  it("sem etapa alvo (nem marcador nem nome) → false", async () => {
    const deps = makeDeps({
      getEtapas: vi.fn(async () => [{ id: "e-1", nome: "Novo Lead", ordem: 1, marcador: null }]),
    });
    expect(await moverParaIaConcluida(makeInput(), deps)).toBe(false);
    expect(deps.updateEtapa).not.toHaveBeenCalled();
  });

  it("forward-only: etapa atual com ordem ≥ alvo não retrocede", async () => {
    const deps = makeDeps();
    expect(await moverParaIaConcluida(makeInput({ etapaAtualId: "e-4" }), deps)).toBe(false);
    expect(await moverParaIaConcluida(makeInput({ etapaAtualId: "e-3" }), deps)).toBe(false);
    expect(deps.updateEtapa).not.toHaveBeenCalled();
  });

  it("etapa atual que não pertence ao funil → false (conservador)", async () => {
    const deps = makeDeps();
    expect(await moverParaIaConcluida(makeInput({ etapaAtualId: "de-outro-funil" }), deps)).toBe(false);
    expect(deps.updateEtapa).not.toHaveBeenCalled();
  });

  it("etapaAtualId null → move (deEtapa null no histórico)", async () => {
    const deps = makeDeps();
    expect(await moverParaIaConcluida(makeInput({ etapaAtualId: null }), deps)).toBe(true);
    expect(deps.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({ deEtapa: null, paraEtapa: "e-3" }),
    );
  });

  it("updateEtapa com {error} → false e não grava histórico", async () => {
    const deps = makeDeps({ updateEtapa: vi.fn(async () => ({ error: { message: "rls" } })) });
    expect(await moverParaIaConcluida(makeInput(), deps)).toBe(false);
    expect(deps.insertHistory).not.toHaveBeenCalled();
  });
});
