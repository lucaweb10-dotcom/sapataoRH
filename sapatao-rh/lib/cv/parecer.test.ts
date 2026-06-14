import { describe, it, expect } from "vitest";
import { parseParecer } from "./parecer";

const valido = JSON.stringify({
  score: 78,
  verdict: "apto",
  criterios_atendidos: [{ criterio: "Idade ≥18", atendido: true, evidencia: "1998" }],
  pontos_fortes: ["Atendimento"],
  pontos_atencao: [],
  experiencia_relevante: "2 anos",
  resumo: "Apto.",
  perguntas_sugeridas_entrevista: ["Locomoção?"],
});

describe("parseParecer", () => {
  it("aceita o JSON do PRD", () => {
    expect(parseParecer(valido)?.score).toBe(78);
    expect(parseParecer(valido)?.verdict).toBe("apto");
  });
  it("rejeita score fora de 0-100", () => {
    expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), score: 150 }))).toBeNull();
    expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), score: -1 }))).toBeNull();
  });
  it("rejeita score não-inteiro", () => {
    expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), score: 78.5 }))).toBeNull();
  });
  it("rejeita verdict inválido", () => {
    expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), verdict: "x" }))).toBeNull();
  });
  it("rejeita campo faltando", () => {
    const semResumo = JSON.parse(valido);
    delete semResumo.resumo;
    expect(parseParecer(JSON.stringify(semResumo))).toBeNull();
  });
  it("rejeita JSON quebrado", () => {
    expect(parseParecer("{nope")).toBeNull();
  });
});
