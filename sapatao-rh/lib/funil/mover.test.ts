import { describe, it, expect, vi } from "vitest";
import { moverCandidato, type MoverDeps } from "./mover";

const input = { empresaId: "emp-1", candidatoId: "c-1", paraEtapaId: "e-2", movidoPor: "u-1" };

function makeDeps(over: Partial<MoverDeps> = {}): MoverDeps {
  return {
    getCandidato: vi.fn(async () => ({ etapa_id: "e-1", empresa_id: "emp-1" })),
    getEtapa: vi.fn(async () => ({ empresa_id: "emp-1", is_terminal: false, status_destino: null })),
    updateEtapa: vi.fn(async () => ({ error: null })),
    insertHistory: vi.fn(async () => ({ error: null })),
    ...over,
  };
}

describe("moverCandidato", () => {
  it("updates the stage and logs history", async () => {
    const deps = makeDeps();
    const r = await moverCandidato(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.updateEtapa).toHaveBeenCalledWith("c-1", "e-2", null);
    expect(deps.insertHistory).toHaveBeenCalledWith(
      expect.objectContaining({ candidatoId: "c-1", deEtapa: "e-1", paraEtapa: "e-2", movidoPor: "u-1" }),
    );
  });

  it("sets candidato.status when the destination stage is terminal", async () => {
    const deps = makeDeps({
      getEtapa: vi.fn(async () => ({ empresa_id: "emp-1", is_terminal: true, status_destino: "reprovado" })),
    });
    const r = await moverCandidato(input, deps);
    expect(r.ok).toBe(true);
    expect(deps.updateEtapa).toHaveBeenCalledWith("c-1", "e-2", "reprovado");
  });

  it("rejects a cross-tenant destination stage", async () => {
    const deps = makeDeps({
      getEtapa: vi.fn(async () => ({ empresa_id: "OTHER", is_terminal: false, status_destino: null })),
    });
    expect(await moverCandidato(input, deps)).toEqual({ ok: false, error: "cross_tenant" });
    expect(deps.updateEtapa).not.toHaveBeenCalled();
  });

  it("returns not_found when candidato or stage is missing", async () => {
    expect(await moverCandidato(input, makeDeps({ getCandidato: vi.fn(async () => null) }))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await moverCandidato(input, makeDeps({ getEtapa: vi.fn(async () => null) }))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("returns not_found when candidato belongs to another tenant", async () => {
    const deps = makeDeps({
      getCandidato: vi.fn(async () => ({ etapa_id: "e-1", empresa_id: "OTHER" })),
    });
    expect(await moverCandidato(input, deps)).toEqual({ ok: false, error: "not_found" });
    expect(deps.getEtapa).not.toHaveBeenCalled();
    expect(deps.updateEtapa).not.toHaveBeenCalled();
  });

  it("returns update_failed and does NOT log history when the update fails", async () => {
    const deps = makeDeps({ updateEtapa: vi.fn(async () => ({ error: { message: "boom" } })) });
    expect(await moverCandidato(input, deps)).toEqual({ ok: false, error: "update_failed" });
    expect(deps.insertHistory).not.toHaveBeenCalled();
  });
});
