import { describe, it, expect } from "vitest";
import { buildPerfilPrompt, MAX_DOC_CHARS, type PerfilCandidato } from "./prompt";
import type { CargoIa, Criterios } from "@/lib/cv/criterios";

const candidato: PerfilCandidato = {
  nome: "Maria Souza",
  telefone: "5511999990000",
  vaga_interesse: "Frentista",
  idade: 25,
  cep: "01000-000",
  endereco: "Rua das Flores, 10",
  tem_veiculo: true,
  tags: ["indicada"],
  notas_internas: "boa comunicação",
};

const criteriosV1: Criterios = {
  prompt_base: "Você é um analista de RH.",
  criterios: ["Idade igual ou maior que 18 anos", "Disponibilidade de horário"],
  gerais: null,
  modelo: "mock",
};

const criteriosV2: Criterios = {
  prompt_base: "Você é um analista de RH.",
  criterios: ["derivado"],
  gerais: {
    versao: 2,
    nao_eliminar: ["orientação sexual", "identidade de gênero"],
    distancia_max: "até 17 min (~8 km) da unidade",
    unidades: ["Matriz — Av. Central, 100"],
    contexto: "Empresa acolhedora LGBT",
  },
  modelo: "gpt-5.6-terra",
};

const cargo: CargoIa = {
  id: "cg-1",
  nome: "Frentista",
  criterios: {
    eliminatorios: ["Ter 18 anos ou mais"],
    desejaveis: ["Experiência em atendimento ao público"],
    pontos_sucesso: ["Morar perto da unidade"],
    pontos_baixa: ["Nunca ter atendido público"],
    contexto_cargo: "Atendimento na pista.",
  },
};

describe("buildPerfilPrompt", () => {
  it("com cargo: system contém a vaga e os critérios do cargo", () => {
    const { system } = buildPerfilPrompt(criteriosV1, cargo, candidato, "transcript", []);
    expect(system).toContain("Vaga avaliada: Frentista");
    expect(system).toContain("Ter 18 anos ou mais");
    expect(system).toContain("Experiência em atendimento ao público");
    expect(system).toContain("eliminatórios");
    expect(system).toContain("desejáveis");
  });

  it("cargo null → aviso de avaliação geral", () => {
    const { system } = buildPerfilPrompt(criteriosV1, null, candidato, "transcript", []);
    expect(system).toContain("avaliação geral");
    expect(system).toContain("Vaga avaliada: Frentista"); // vaga_interesse do candidato
  });

  it("gerais preenchidos: NÃO elimine, unidades, distância e contexto no system", () => {
    const { system } = buildPerfilPrompt(criteriosV2, null, candidato, "transcript", []);
    expect(system).toContain("NÃO elimine");
    expect(system).toContain("orientação sexual");
    expect(system).toContain("até 17 min (~8 km) da unidade");
    expect(system).toContain("Matriz — Av. Central, 100");
    expect(system).toContain("Empresa acolhedora LGBT");
  });

  it("gerais null → lista flat numerada", () => {
    const { system } = buildPerfilPrompt(criteriosV1, null, candidato, "transcript", []);
    expect(system).toContain("Critérios de avaliação da empresa:");
    expect(system).toContain("1. Idade igual ou maior que 18 anos");
    expect(system).toContain("2. Disponibilidade de horário");
  });

  it("user contém dados do candidato, transcript e docs", () => {
    const { user } = buildPerfilPrompt(criteriosV1, cargo, candidato, "CONVERSA AQUI", [
      { nome: "cv.docx", texto: "texto extraído do docx" },
    ]);
    expect(user).toContain("Maria Souza");
    expect(user).toContain("5511999990000");
    expect(user).toContain("- Idade: 25");
    expect(user).toContain("- Tem veículo: sim");
    expect(user).toContain("- Tags: indicada");
    expect(user).toContain("CONVERSA AQUI");
    expect(user).toContain('FONTE "curriculo" — anexos (texto extraído):');
    expect(user).toContain("--- cv.docx ---");
    expect(user).toContain("texto extraído do docx");
  });

  it("sem docs, o bloco de anexos não aparece", () => {
    const { user } = buildPerfilPrompt(criteriosV1, cargo, candidato, "t", []);
    expect(user).not.toContain("ANEXOS");
  });

  it("doc acima de MAX_DOC_CHARS é truncado com '[truncado]'", () => {
    const texto = "x".repeat(MAX_DOC_CHARS) + "FIM_DO_DOC";
    const { user } = buildPerfilPrompt(criteriosV1, null, candidato, "t", [{ nome: "grande.docx", texto }]);
    expect(user).toContain("…[truncado]");
    expect(user).not.toContain("FIM_DO_DOC");
  });

  it("máximo de 2 docs (o terceiro é descartado)", () => {
    const { user } = buildPerfilPrompt(criteriosV1, null, candidato, "t", [
      { nome: "doc1.docx", texto: "a" },
      { nome: "doc2.docx", texto: "b" },
      { nome: "doc3.docx", texto: "c" },
    ]);
    expect(user).toContain("--- doc1.docx ---");
    expect(user).toContain("--- doc2.docx ---");
    expect(user).not.toContain("doc3.docx");
  });
});
