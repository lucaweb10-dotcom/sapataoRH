import type { EtapaSnapshot } from "@/lib/indicadores/queries";

export function FunilSnapshot({ etapas }: { etapas: EtapaSnapshot[] }) {
  if (etapas.length === 0) {
    return <p className="text-sm text-neutro-700">Nenhum funil configurado.</p>;
  }

  const temSla = etapas.some((e) => e.sla_dias != null);

  return (
    <div className="overflow-x-auto rounded-xl border border-neutro-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutro-200 text-left text-xs uppercase tracking-wide text-neutro-700">
            <th className="px-4 py-3">Etapa</th>
            <th className="px-4 py-3 text-right">Candidatos</th>
            <th className="px-4 py-3 text-right">% ativos</th>
            {temSla && <th className="px-4 py-3 text-right">SLA dentro / fora</th>}
          </tr>
        </thead>
        <tbody>
          {etapas.map((e, i) => (
            <tr
              key={e.id}
              className={`border-b border-neutro-100 last:border-0 ${
                i % 2 === 0 ? "bg-white" : "bg-neutro-50"
              }`}
            >
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: e.cor }}
                  />
                  {e.nome}
                </div>
              </td>
              <td className="px-4 py-2.5 text-right font-medium">{e.total}</td>
              <td className="px-4 py-2.5 text-right text-neutro-700">
                {e.total > 0 ? `${e.pct}%` : "—"}
              </td>
              {temSla && (
                <td className="px-4 py-2.5 text-right">
                  {e.sla_dias != null ? (
                    <span>
                      <span className="text-brand-700">{e.sla_dentro}</span>
                      {" / "}
                      <span className={e.sla_fora > 0 ? "font-medium text-destructive" : "text-neutro-700"}>
                        {e.sla_fora}
                      </span>
                    </span>
                  ) : (
                    <span className="text-neutro-400">—</span>
                  )}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
