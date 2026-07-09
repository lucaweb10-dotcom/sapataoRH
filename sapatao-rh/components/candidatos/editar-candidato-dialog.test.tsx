import { describe, it, expect } from "vitest";
import { CandidatoEditavel } from "./editar-candidato-dialog";
import type { Candidato } from "@/types/database";

describe("EditarCandidatoDialog", () => {
  it("exports CandidatoEditavel type correctly", () => {
    // Type-level test: CandidatoEditavel should be Pick of required fields
    const mockCandidato: CandidatoEditavel = {
      id: "123",
      nome: "João",
      idade: 30,
      cep: "12345-678",
      endereco: "Rua Test",
      tem_veiculo: true,
      telefone: "11999999999",
      vaga_interesse: "Desenvolvedor",
      tags: ["react"],
      atribuido_a: "456",
    };
    expect(mockCandidato.id).toBe("123");
    expect(mockCandidato.nome).toBe("João");
  });
});
