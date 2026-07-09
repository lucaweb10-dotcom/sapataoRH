import { dataBr } from "@/lib/shared/datas";
import { formatarCpf } from "./cpf";
import type { Funcionario } from "@/types/database";

export type FuncionarioCsvRow = Funcionario & { unidade_nome: string | null };

const CABECALHO = [
  "Nome completo",
  "CPF",
  "Cargo",
  "Unidade",
  "Status",
  "Data de admissão",
  "Data de demissão",
  "Telefone",
  "E-mail",
  "CEP",
  "Endereço",
  "Salário",
  "Jornada",
];

/** Escapes one CSV field (separator ';' — padrão Excel pt-BR). */
function campo(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[";,\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Builds the funcionarios CSV (sem BOM — o caller prefixa se quiser Excel). */
export function gerarCsv(rows: FuncionarioCsvRow[]): string {
  const linhas = [CABECALHO.join(";")];
  for (const f of rows) {
    linhas.push(
      [
        campo(f.nome_completo),
        campo(formatarCpf(f.cpf)),
        campo(f.cargo),
        campo(f.unidade_nome),
        campo(f.status),
        campo(dataBr(f.data_admissao)),
        campo(dataBr(f.data_demissao)),
        campo(f.telefone),
        campo(f.email),
        campo(f.cep),
        campo(f.endereco),
        campo(f.salario === null ? "" : String(f.salario).replace(".", ",")),
        campo(f.jornada),
      ].join(";"),
    );
  }
  return linhas.join("\r\n") + "\r\n";
}
