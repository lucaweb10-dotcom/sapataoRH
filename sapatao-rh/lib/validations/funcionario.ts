import { z } from "zod";
import { cpfValido, normalizarCpf } from "@/lib/funcionarios/cpf";

const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida");

/** Campo opcional de formulário: "" -> null. */
const textoOpcional = z
  .string()
  .max(300)
  .transform((s) => {
    const t = s.trim();
    return t === "" ? null : t;
  });

export const funcionarioSchema = z
  .object({
    nome_completo: z.string().trim().min(3, "Informe o nome completo").max(200),
    cpf: z
      .string()
      .max(20)
      .transform((s) => {
        const d = normalizarCpf(s);
        return d === "" ? null : d;
      })
      .refine((d) => d === null || cpfValido(d), "CPF inválido"),
    rg: textoOpcional,
    data_nascimento: dataIso.nullable().or(z.literal("").transform(() => null)),
    telefone: textoOpcional,
    email: z
      .string()
      .max(200)
      .transform((s) => (s.trim() === "" ? null : s.trim()))
      .refine((s) => s === null || z.email().safeParse(s).success, "E-mail inválido"),
    cep: textoOpcional,
    endereco: textoOpcional,
    cargo: z.string().trim().min(2, "Informe o cargo").max(120),
    unidade_id: z.uuid().nullable().or(z.literal("").transform(() => null)),
    data_admissao: dataIso,
    salario: z
      .string()
      .max(20)
      .transform((s) => {
        const t = s.trim().replace(/\./g, "").replace(",", ".");
        return t === "" ? null : Number(t);
      })
      .refine((n) => n === null || (Number.isFinite(n) && n >= 0), "Salário inválido"),
    jornada: textoOpcional,
    candidato_origem_id: z.uuid().nullable().optional(),
  })
  .strict();

export type FuncionarioInput = z.input<typeof funcionarioSchema>;
export type FuncionarioParsed = z.output<typeof funcionarioSchema>;

export const ocorrenciaSchema = z
  .object({
    tipo: z.enum(["falta", "atestado", "advertencia", "elogio", "desligamento", "outro"]),
    data: dataIso,
    observacao: z
      .string()
      .max(2000)
      .transform((s) => (s.trim() === "" ? null : s.trim())),
  })
  .strict();

export type OcorrenciaInput = z.input<typeof ocorrenciaSchema>;

export const inativarSchema = z
  .object({
    motivo: z.string().trim().min(3, "Informe o motivo").max(2000),
    data_demissao: dataIso,
  })
  .strict();

export type InativarInput = z.input<typeof inativarSchema>;
