import { describe, it, expect } from "vitest";
import { agruparPorEtapa } from "./agrupar";

describe("agruparPorEtapa", () => {
  it("groups candidates under their stage, preserving stage order + empty stages", () => {
    const etapas = [{ id: "e1" }, { id: "e2" }, { id: "e3" }];
    const cands = [
      { etapa_id: "e2", n: 1 },
      { etapa_id: "e1", n: 2 },
      { etapa_id: "e2", n: 3 },
      { etapa_id: null, n: 4 },
      { etapa_id: "zzz", n: 5 },
    ];
    const m = agruparPorEtapa(etapas, cands);
    expect([...m.keys()]).toEqual(["e1", "e2", "e3"]);
    expect(m.get("e1")!.map((c) => c.n)).toEqual([2]);
    expect(m.get("e2")!.map((c) => c.n)).toEqual([1, 3]);
    expect(m.get("e3")).toEqual([]);
  });

  it("preserves candidate input order within a stage (stable)", () => {
    const etapas = [{ id: "e1" }];
    const cands = [
      { etapa_id: "e1", n: 10 },
      { etapa_id: "e1", n: 20 },
      { etapa_id: "e1", n: 30 },
    ];
    expect(agruparPorEtapa(etapas, cands).get("e1")!.map((c) => c.n)).toEqual([10, 20, 30]);
  });

  it("returns an empty map for no stages", () => {
    expect([...agruparPorEtapa([], [{ etapa_id: "e1" }]).keys()]).toEqual([]);
  });
});
