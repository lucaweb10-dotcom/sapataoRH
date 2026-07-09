/** Valores do formulário de funcionário (strings de input).
 *  Módulo neutro (sem "use client") — importável por server pages e pelo form:
 *  espalhar um export de módulo client dentro de um server component espalha o
 *  client-reference proxy, não o objeto. */
export type FormValores = {
  nome_completo: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  telefone: string;
  email: string;
  cep: string;
  endereco: string;
  cargo: string;
  unidade_id: string;
  data_admissao: string;
  salario: string;
  jornada: string;
};

export const FORM_VAZIO: FormValores = {
  nome_completo: "",
  cpf: "",
  rg: "",
  data_nascimento: "",
  telefone: "",
  email: "",
  cep: "",
  endereco: "",
  cargo: "",
  unidade_id: "",
  data_admissao: "",
  salario: "",
  jornada: "",
};
