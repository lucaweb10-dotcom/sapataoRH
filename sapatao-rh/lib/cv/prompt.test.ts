import { describe, it, expect } from "vitest";
import { buildCvPrompt } from "./prompt";
import type { Criterios } from "./criterios";

const criterios: Criterios = {
  prompt_base: "Você é um analista de RH.",
  criterios: ["Idade ≥18", "Tem veículo"],
  modelo: "mock",
};

describe("buildCvPrompt", () => {
  it("lista os critérios no system e inclui vaga + CV no user", () => {
    const { system, user } = buildCvPrompt(criterios, "Frentista", "texto do curriculo");
    expect(system).toContain("Idade ≥18");
    expect(system).toContain("Tem veículo");
    expect(user).toContain("Frentista");
    expect(user).toContain("texto do curriculo");
  });
  it("usa 'não informada' quando não há vaga", () => {
    expect(buildCvPrompt(criterios, null, "cv").user).toContain("não informada");
  });
  it("trunca CV acima de 12000 chars", () => {
    const longo = "a".repeat(13000);
    const { user } = buildCvPrompt(criterios, "X", longo);
    expect(user).toContain("[truncado]");
    expect(user.length).toBeLessThan(longo.length + 200);
  });
});
