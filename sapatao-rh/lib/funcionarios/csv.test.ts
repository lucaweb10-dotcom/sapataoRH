import { describe, it, expect } from "vitest";
import { gerarCsv, type FuncionarioCsvRow } from "./csv";

function row(over: Partial<FuncionarioCsvRow> = {}): FuncionarioCsvRow {
  return {
    id: "f1",
    empresa_id: "e1",
    candidato_origem_id: null,
    nome_completo: "Ana Souza",
    cpf: "52998224725",
    rg: null,
    data_nascimento: null,
    telefone: "5551999990000",
    email: "ana@ex.com",
    cep: "93500-000",
    endereco: "Rua A, 10",
    cargo: "Frentista",
    unidade_id: "u1",
    data_admissao: "2026-01-15",
    data_demissao: null,
    salario: 2350.5,
    jornada: "44h semanais",
    status: "ativo",
    created_at: "",
    updated_at: "",
    unidade_nome: "Novo Hamburgo",
    ...over,
  };
}

describe("gerarCsv", () => {
  it("emits header + rows separated by ';' with CRLF", () => {
    const csv = gerarCsv([row()]);
    const linhas = csv.split("\r\n");
    expect(linhas[0]).toContain("Nome completo;CPF;Cargo;Unidade;Status");
    expect(linhas[1]).toBe(
      'Ana Souza;529.982.247-25;Frentista;Novo Hamburgo;ativo;15/01/2026;;5551999990000;ana@ex.com;93500-000;"Rua A, 10";"2350,5";44h semanais',
    );
    expect(csv.endsWith("\r\n")).toBe(true);
  });

  it("escapes quotes, separators and newlines", () => {
    const csv = gerarCsv([
      row({ nome_completo: 'Zé "Tri" da Silva', endereco: "Av B; casa\nfundos" }),
    ]);
    expect(csv).toContain('"Zé ""Tri"" da Silva"');
    expect(csv).toContain('"Av B; casa\nfundos"');
  });

  it("handles empty list (only header)", () => {
    const csv = gerarCsv([]);
    expect(csv.split("\r\n").filter(Boolean)).toHaveLength(1);
  });
});
