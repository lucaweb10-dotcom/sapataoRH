import { describe, it, expect } from "vitest";
import { z } from "zod";
import { toStrictJsonSchema } from "./json-schema";
import { PARECER_JSON_SCHEMA } from "@/lib/cv/parecer";

/** Coleta recursivamente todo nó type==="object" (incl. items de arrays). */
function coletarObjetos(node: unknown, acc: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) coletarObjetos(item, acc);
    return acc;
  }
  if (!node || typeof node !== "object") return acc;
  const obj = node as Record<string, unknown>;
  if (obj.type === "object" && obj.properties && typeof obj.properties === "object") acc.push(obj);
  for (const value of Object.values(obj)) coletarObjetos(value, acc);
  return acc;
}

function assertStrict(schema: Record<string, unknown>): void {
  const objetos = coletarObjetos(schema);
  expect(objetos.length).toBeGreaterThan(0);
  for (const obj of objetos) {
    expect(obj.additionalProperties).toBe(false);
    const keys = Object.keys(obj.properties as Record<string, unknown>).sort();
    expect([...(obj.required as string[])].sort()).toEqual(keys);
  }
}

describe("toStrictJsonSchema", () => {
  it("remove o $schema do topo", () => {
    const raw = toStrictJsonSchema(z.object({ a: z.string() }));
    expect("$schema" in raw).toBe(false);
  });

  it("todo objeto (recursivo, incl. items de array) tem additionalProperties=false e required com TODAS as keys", () => {
    const schema = z.object({
      a: z.string(),
      b: z.array(z.object({ c: z.number(), d: z.string().optional() })),
      e: z.object({ f: z.boolean(), g: z.object({ h: z.string() }) }),
    });
    const raw = toStrictJsonSchema(schema);
    const objetos = coletarObjetos(raw);
    // raiz + item do array + e + g = 4 nós objeto
    expect(objetos.length).toBe(4);
    assertStrict(raw);
    // o item do array em especial: required cobre inclusive a key opcional
    const itemArray = objetos.find((o) => Object.keys(o.properties as object).includes("c"))!;
    expect([...(itemArray.required as string[])].sort()).toEqual(["c", "d"]);
  });
});

describe("PARECER_JSON_SCHEMA", () => {
  it("tem name 'parecer' e schema sem $schema no topo", () => {
    expect(PARECER_JSON_SCHEMA.name).toBe("parecer");
    expect("$schema" in PARECER_JSON_SCHEMA.schema).toBe(false);
  });

  it("todos os nós objeto são strict (additionalProperties=false, required completo)", () => {
    const objetos = coletarObjetos(PARECER_JSON_SCHEMA.schema);
    // raiz + item de criterios_atendidos, no mínimo
    expect(objetos.length).toBeGreaterThanOrEqual(2);
    assertStrict(PARECER_JSON_SCHEMA.schema);
  });

  it("a raiz exige todas as keys do parecer", () => {
    const raiz = PARECER_JSON_SCHEMA.schema as Record<string, unknown>;
    expect(raiz.type).toBe("object");
    expect([...(raiz.required as string[])].sort()).toEqual(
      [
        "score",
        "verdict",
        "criterios_atendidos",
        "pontos_fortes",
        "pontos_atencao",
        "experiencia_relevante",
        "resumo",
        "perguntas_sugeridas_entrevista",
      ].sort(),
    );
  });
});
