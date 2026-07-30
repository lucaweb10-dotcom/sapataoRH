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
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Funcionário</TableHead>
          <TableHead>Cargo</TableHead>
          <TableHead>Unidade</TableHead>
          <TableHead>Admissão</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((f) => (
          <TableRow
            key={f.id}
            onClick={() => router.push(`/funcionarios/${f.id}`)}
            className="cursor-pointer"
          >
            <TableCell>
              <div className="min-w-0 leading-tight">
                <p className="truncate text-sm font-semibold text-foreground">
                  {f.nome_completo}
                </p>
                {f.cpf && (
                  <p className="truncate text-caption text-muted-foreground">
                    {formatarCpf(f.cpf)}
                  </p>
                )}
              </div>
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">{f.cargo}</TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {(f.unidade_id && unidadesById[f.unidade_id]) || "—"}
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {dataBr(f.data_admissao)}
            </TableCell>
            <TableCell>
              <FuncionarioStatusBadge status={f.status} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
