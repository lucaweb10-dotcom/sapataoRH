// Radar de custos (decisão do usuário): consumo REAL reportado pela OpenAI em
// cada análise, convertido em US$/R$ pela tabela de preços — visão do gestor.
import { USD_BRL_APROX } from "@/lib/llm/modelos";
import { TZ_BR } from "@/lib/shared/datas";

interface UltimaAnalise {
  quando: string;
  origem: "cv" | "perfil";
  cargo: string | null;
  modelo: string | null;
  tokens: number | null;
  custoUsd: number | null;
  status: string;
}

interface Props {
  tokensUsados: number;
  custoMesUsd: number;
  limite: number | null;
  totalAnalises: number;
  dePerfilOk: number;
  ultimas: UltimaAnalise[];
}

const fmtInt = (n: number) => n.toLocaleString("pt-BR");
const fmtUsd = (n: number) => `US$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtBrl = (n: number) => `R$ ${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function dataHoraCurta(iso: string): string {
  const d = new Date(iso);
  const data = d.toLocaleDateString("pt-BR", { timeZone: TZ_BR, day: "2-digit", month: "2-digit" });
  const hora = d.toLocaleTimeString("pt-BR", { timeZone: TZ_BR, hour: "2-digit", minute: "2-digit" });
  return `${data} ${hora}`;
}

export function RadarCustosCard({ tokensUsados, custoMesUsd, limite, totalAnalises, dePerfilOk, ultimas }: Props) {
  const mesLabel = new Date().toLocaleDateString("pt-BR", { timeZone: TZ_BR, month: "long", year: "numeric" });
  const pct = limite ? Math.min(100, Math.round((tokensUsados / limite) * 100)) : null;
  const corBarra =
    pct === null ? "" : pct >= 100 ? "bg-sapatao-laranja" : pct >= 70 ? "bg-amber-500" : "bg-sapatao-verde";
  const deCvOk = totalAnalises - dePerfilOk;
  const custoMedio = totalAnalises > 0 ? custoMesUsd / totalAnalises : 0;

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold text-neutro-900">Radar de custos</h2>
        <span className="text-xs text-neutro-500">{mesLabel}</span>
      </div>

      {totalAnalises === 0 && tokensUsados === 0 ? (
        <p className="text-sm text-neutro-600">
          Nenhuma análise este mês. O consumo real reportado pela OpenAI aparece aqui a cada
          análise.
        </p>
      ) : (
        <>
          <div>
            <p className="text-2xl font-bold text-neutro-900">
              {fmtUsd(custoMesUsd)}{" "}
              <span className="text-sm font-normal text-neutro-500">
                ≈ {fmtBrl(custoMesUsd * USD_BRL_APROX)}
              </span>
            </p>
            <p className="text-xs text-neutro-500">
              Custo do mês, estimado pela tabela de preços dos modelos e pelo uso real reportado
              pela OpenAI em cada chamada.
            </p>
          </div>

          <div className="space-y-1">
            <p className="text-sm text-neutro-900">
              {limite
                ? `${fmtInt(tokensUsados)} de ${fmtInt(limite)} tokens usados`
                : `${fmtInt(tokensUsados)} tokens usados (sem limite definido)`}
            </p>
            {pct !== null && (
              <div className="h-2 rounded-full bg-neutro-100">
                <div className={`h-2 rounded-full ${corBarra}`} style={{ width: `${pct}%` }} />
              </div>
            )}
            {pct !== null && pct >= 100 && (
              <p className="text-xs font-medium text-sapatao-laranja">
                Limite atingido — novas análises estão bloqueadas até o próximo mês. Aumente o
                limite acima para liberar.
              </p>
            )}
            <p className="text-xs text-neutro-500">
              {totalAnalises === 1 ? "1 análise concluída" : `${totalAnalises} análises concluídas`}
              {totalAnalises > 0 && ` (${dePerfilOk} de perfil, ${deCvOk} de currículo)`}
              {totalAnalises > 0 && ` · custo médio ${fmtUsd(custoMedio)}/análise`}
            </p>
          </div>

          {ultimas.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-neutro-700">Últimas análises</p>
              <ul className="divide-y divide-neutro-100 text-xs text-neutro-600">
                {ultimas.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-x-2 py-1.5">
                    <span className="text-neutro-500">{dataHoraCurta(a.quando)}</span>
                    <span>{a.origem === "perfil" ? "Perfil da conversa" : "Currículo"}</span>
                    {a.cargo && <span className="rounded-full bg-neutro-50 border border-neutro-200 px-1.5">{a.cargo}</span>}
                    {a.status !== "ok" && <span className="text-sapatao-laranja">({a.status})</span>}
                    <span className="ml-auto">
                      {a.modelo ?? "—"} · {a.tokens === null ? "—" : fmtInt(a.tokens)} tokens
                      {a.custoUsd !== null && ` · ${fmtUsd(a.custoUsd)}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
