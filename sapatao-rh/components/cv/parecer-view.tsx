"use client";
import { parecerSchema, type Parecer } from "@/lib/cv/parecer";
import { scoreFaixa } from "@/lib/funil/scoring";
import { dataHoraBr } from "@/lib/shared/datas";

const FAIXA_COR: Record<string, string> = {
  sem: "text-neutro-700",
  baixo: "text-red-600",
  medio: "text-amber-600",
  alto: "text-green-600",
};

const VERDICT_LABEL: Record<Parecer["verdict"], string> = {
  apto: "Apto",
  atencao: "Atenção",
  inapto: "Inapto",
};

function Lista({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-xs font-medium text-neutro-700">{title}</p>
      <ul className="mt-0.5 list-disc pl-4 text-sm text-neutro-900">
        {items.map((it, i) => (
          <li key={i}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

export interface ParecerOrigem {
  fonte: "cv" | "perfil";
  quando: string;
  modelo: string | null;
  cargo: string | null;
}

function origemLabel(o: ParecerOrigem): string {
  const partes = [
    o.fonte === "perfil" ? "Análise do perfil da conversa" : "Análise do currículo anexado",
    ...(o.cargo ? [o.cargo] : []),
    dataHoraBr(o.quando), // fuso fixo BR: mesmo output no SSR e no browser
    ...(o.modelo ? [o.modelo] : []),
  ];
  return partes.join(" · ");
}

/** Structured render of a CV analysis. Validates `parecer` defensively (it is
 *  stored as free jsonb), so old/partial data degrades to the empty state. */
export function ParecerView({
  parecer,
  score,
  origem,
}: {
  parecer: Record<string, unknown> | null;
  score: number | null;
  origem?: ParecerOrigem | null;
}) {
  const parsed = parecer ? parecerSchema.safeParse(parecer) : null;
  if (!parsed || !parsed.success) {
    return <p className="text-sm text-neutro-700">Sem análise de IA ainda.</p>;
  }
  const p = parsed.data;
  const faixa = scoreFaixa(score ?? p.score);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold ${FAIXA_COR[faixa]}`}>{p.score}</span>
        <span className="rounded-full border border-neutro-200 px-2 py-0.5 text-xs font-medium text-neutro-700">
          {VERDICT_LABEL[p.verdict]}
        </span>
      </div>

      <p className="text-sm text-neutro-900">{p.resumo}</p>

      {p.criterios_atendidos.length > 0 && (
        <ul className="space-y-1">
          {p.criterios_atendidos.map((c, i) => (
            <li key={i} className="flex gap-1.5 text-xs">
              <span className={c.atendido ? "text-green-600" : "text-red-600"}>{c.atendido ? "✓" : "✗"}</span>
              <span className="text-neutro-900">{c.criterio}</span>
              {c.evidencia && <span className="text-neutro-700">— {c.evidencia}</span>}
            </li>
          ))}
        </ul>
      )}

      <Lista title="Pontos fortes" items={p.pontos_fortes} />
      <Lista title="Pontos de atenção" items={p.pontos_atencao} />

      {p.experiencia_relevante && (
        <div>
          <p className="text-xs font-medium text-neutro-700">Experiência relevante</p>
          <p className="mt-0.5 text-sm text-neutro-900">{p.experiencia_relevante}</p>
        </div>
      )}

      <Lista title="Perguntas para entrevista" items={p.perguntas_sugeridas_entrevista} />

      {origem && (
        <p className="border-t border-neutro-200 pt-2 text-[11px] text-neutro-500">{origemLabel(origem)}</p>
      )}
    </div>
  );
}
