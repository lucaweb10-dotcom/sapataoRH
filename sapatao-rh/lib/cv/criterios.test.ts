import { describe, it, expect, vi } from "vitest";

// O módulo importa createClient (next/headers) no topo — mock evita o runtime do Next.
// Aqui testamos APENAS as partes puras (resolverCargo, schemas, CARGOS_PADRAO).
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import {
  resolverCargo,
  criteriosGeraisSchema,
  criteriosCargoSchema,
  CARGOS_PADRAO,
  type CargoIa,
} from "./criterios";

function makeCargo(nome: string, id = nome.toLowerCase()): CargoIa {
  return { id, nome, criterios: criteriosCargoSchema.parse({}) };
}

describe("resolverCargo", () => {
  it("match exato normalizado (caixa + espaços): vaga 'FRENTISTA ' encontra 'Frentista'", () => {
    const cargos = [makeCargo("Frentista"), makeCargo("Caixa")];
    const r = resolverCargo(cargos, "FRENTISTA ");
    expect(r).toEqual({ tipo: "match", cargo: cargos[0] });
  });

  it("match ignora acentos: vaga 'deposito' encontra 'Depósito'", () => {
    const cargos = [makeCargo("Depósito"), makeCargo("Caixa")];
    const r = resolverCargo(cargos, "deposito");
    expect(r).toEqual({ tipo: "match", cargo: cargos[0] });
  });

  it("vaga que CONTÉM o nome do cargo → match", () => {
    const cargos = [makeCargo("Frentista"), makeCargo("Caixa")];
    const r = resolverCargo(cargos, "vaga de frentista noturno");
    expect(r).toEqual({ tipo: "match", cargo: cargos[0] });
  });

  it("1 cargo ativo sem vaga → unico", () => {
    const cargos = [makeCargo("Frentista")];
    expect(resolverCargo(cargos, null)).toEqual({ tipo: "unico", cargo: cargos[0] });
  });

  it("0 cargos → nenhum", () => {
    expect(resolverCargo([], "frentista")).toEqual({ tipo: "nenhum" });
  });

  it("2 cargos sem match → ambiguo", () => {
    const cargos = [makeCargo("Frentista"), makeCargo("Caixa")];
    expect(resolverCargo(cargos, "motorista")).toEqual({ tipo: "ambiguo" });
    expect(resolverCargo(cargos, null)).toEqual({ tipo: "ambiguo" });
  });
});

describe("criteriosGeraisSchema", () => {
  it("objeto válido mínimo preenche os defaults", () => {
    const r = criteriosGeraisSchema.parse({ versao: 2 });
    expect(r).toEqual({ versao: 2, nao_eliminar: [], distancia_max: "", unidades: [], contexto: "" });
  });

  it("versao errada falha", () => {
    expect(criteriosGeraisSchema.safeParse({ versao: 1 }).success).toBe(false);
    expect(criteriosGeraisSchema.safeParse({}).success).toBe(false);
  });

  it("aceita listas preenchidas", () => {
    const r = criteriosGeraisSchema.parse({
      versao: 2,
      nao_eliminar: ["orientação sexual"],
      distancia_max: "até 8 km",
      unidades: ["Matriz — Av. Central, 100"],
      contexto: "empresa acolhedora",
    });
    expect(r.nao_eliminar).toEqual(["orientação sexual"]);
    expect(r.distancia_max).toBe("até 8 km");
  });
});

describe("criteriosCargoSchema", () => {
  it("parse({}) preenche todos os defaults", () => {
    expect(criteriosCargoSchema.parse({})).toEqual({
      eliminatorios: [],
      desejaveis: [],
      pontos_sucesso: [],
      pontos_baixa: [],
      contexto_cargo: "",
    });
  });
});

describe("CARGOS_PADRAO", () => {
  it("todos os critérios passam no criteriosCargoSchema", () => {
    for (const cargo of CARGOS_PADRAO) {
      expect(criteriosCargoSchema.safeParse(cargo.criterios).success).toBe(true);
    }
  });

  it("nomes são únicos", () => {
    const nomes = CARGOS_PADRAO.map((c) => c.nome);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
