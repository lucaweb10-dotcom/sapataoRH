"use client";
import { parecerSchema, FONTE_ROTULO, type Fonte, type Parecer } from "@/lib/cv/parecer";
import { scoreFaixa } from "@/lib/funil/scoring";
import { dataHoraBr } from "@/lib/shared/datas";

const FAIXA_COR: Record<string, string> = {
  sem: "text-muted-foreground",
  baixo: "text-danger",
  medio: "text-warning",
  alto: "text-success",
};

const VERDICT_LABEL: Record<Parecer["verdict"], string> = {
  apto: "Apto",
  atencao: "Atenção",
  inapto: "Inapto",
};

/** Quão verificável é a afirmação: documentado > autodeclarado > sem fonte. */
const FONTE_COR: Record<Fonte, string> = {
  curriculo: "border-success/40 text-success",
  cadastro: "border-info/40 text-info",
  conversa: "border-warning/40 text-warning",
  nao_consta: "border-border text-muted-foreground",
};

function FonteBadge({ fonte }: { fonte: Fonte }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-1.5 text-micro ${FONTE_COR[fonte]}`}
      title="De onde veio esta evidência"
    >
      {FONTE_ROTULO[fonte]}
    </span>
  );
}

function Lista({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <p className="text-caption font-medium text-muted-foreground">{title}</p>
      <ul className="mt-0.5 list-disc pl-4 text-sm text-foreground">
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
    return <p className="text-sm text-muted-foreground">Sem análise de IA ainda.</p>;
  }
  const p = parsed.data;
  const faixa = scoreFaixa(score ?? p.score);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className={`text-3xl font-bold ${FAIXA_COR[faixa]}`}>{p.score}</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-caption font-medium text-muted-foreground">
          {VERDICT_LABEL[p.verdict]}
        </span>
      </div>

      <p className="text-sm text-foreground">{p.resumo}</p>

      {p.criterios_atendidos.length > 0 && (
        <ul className="space-y-1">
          {p.criterios_atendidos.map((c, i) => (
            <li key={i} className="flex flex-wrap items-start gap-1.5 text-caption">
              <span className={c.atendido ? "text-success" : "text-danger"}>{c.atendido ? "✓" : "✗"}</span>
              <span className="text-foreground">{c.criterio}</span>
              {c.fonte && <FonteBadge fonte={c.fonte} />}
              {c.evidencia && <span className="text-muted-foreground">— {c.evidencia}</span>}
            </li>
          ))}
        </ul>
      )}

      {p.contradicoes && p.contradicoes.length > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-soft p-2.5">
          <p className="text-caption font-medium text-warning-foreground">
            Divergência entre as fontes — confirme na entrevista
          </p>
          <ul className="mt-1 space-y-1.5">
            {p.contradicoes.map((c, i) => (
              <li key={i} className="text-caption">
                <span className="font-medium text-foreground">{c.tema}</span>
                <br />
                <span className="text-muted-foreground">Na conversa: {c.na_conversa}</span>
                <br />
                <span className="text-muted-foreground">Em outra fonte: {c.em_outra_fonte}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Lista title="Pontos fortes" items={p.pontos_fortes} />
      <Lista title="Pontos de atenção" items={p.pontos_atencao} />

      {p.experiencia_relevante && (
        <div>
          <p className="text-caption font-medium text-muted-foreground">Experiência relevante</p>
          <p className="mt-0.5 text-sm text-foreground">{p.experiencia_relevante}</p>
        </div>
      )}

      <Lista title="Perguntas para entrevista" items={p.perguntas_sugeridas_entrevista} />

      {origem && (
        <p className="border-t border-border pt-2 text-micro text-muted-foreground">{origemLabel(origem)}</p>
      )}
    </div>
  );
}
