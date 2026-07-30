import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { EtapaSnapshot } from "@/lib/indicadores/queries";

export function FunilSnapshot({ etapas }: { etapas: EtapaSnapshot[] }) {
  if (etapas.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhum funil configurado.</p>;
  }

  const temSla = etapas.some((e) => e.sla_dias != null);

  return (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Etapa</TableHead>
          <TableHead className="text-right">Candidatos</TableHead>
          <TableHead className="text-right">% ativos</TableHead>
          {temSla && <TableHead className="text-right">SLA dentro / fora</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {etapas.map((e) => (
          <TableRow key={e.id}>
            <TableCell>
              <div className="flex items-center gap-2">
                <span
                  className="inline-block size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: e.cor }}
                />
                {e.nome}
              </div>
            </TableCell>
            <TableCell className="text-right font-medium">{e.total}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {e.total > 0 ? `${e.pct}%` : "—"}
            </TableCell>
            {temSla && (
              <TableCell className="text-right">
                {e.sla_dias != null ? (
                  <span>
                    <span className="text-success">{e.sla_dentro}</span>
                    {" / "}
                    <span
                      className={
                        e.sla_fora > 0 ? "font-medium text-danger" : "text-muted-foreground"
                      }
                    >
                      {e.sla_fora}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
