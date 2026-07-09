"use client";
import { useRouter } from "next/navigation";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FuncionarioStatusBadge } from "./status-badge";
import { formatarCpf } from "@/lib/funcionarios/cpf";
import { dataBr } from "@/lib/shared/datas";
import type { FuncionarioLista } from "@/lib/funcionarios/queries";

export function FuncionariosTabela({
  rows,
  unidadesById,
}: {
  rows: FuncionarioLista[];
  unidadesById: Record<string, string>;
}) {
  const router = useRouter();

  return (
    <div className="rounded-xl border border-neutro-200 bg-card shadow-warm">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">Funcionário</TableHead>
            <TableHead>Cargo</TableHead>
            <TableHead>Unidade</TableHead>
            <TableHead>Admissão</TableHead>
            <TableHead className="pr-4">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((f) => (
            <TableRow
              key={f.id}
              onClick={() => router.push(`/funcionarios/${f.id}`)}
              className="cursor-pointer"
            >
              <TableCell className="pl-4">
                <div className="min-w-0 leading-tight">
                  <p className="truncate text-sm font-semibold text-neutro-900">
                    {f.nome_completo}
                  </p>
                  {f.cpf && (
                    <p className="truncate text-xs text-neutro-500">{formatarCpf(f.cpf)}</p>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-sm text-neutro-700">{f.cargo}</TableCell>
              <TableCell className="text-sm text-neutro-700">
                {(f.unidade_id && unidadesById[f.unidade_id]) || "—"}
              </TableCell>
              <TableCell className="text-sm tabular-nums text-neutro-700">
                {dataBr(f.data_admissao)}
              </TableCell>
              <TableCell className="pr-4">
                <FuncionarioStatusBadge status={f.status} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
