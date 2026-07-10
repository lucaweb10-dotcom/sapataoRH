// Fonte única dos modelos OpenAI oferecidos na UI e da tabela de preços usada
// pelo radar de custos. Preços em US$ por 1M de tokens (jul/2026) — o radar
// rotula os valores como estimativa baseada nesta tabela.

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
export const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe-diarize";

/** Conversão aproximada p/ exibição ao gestor (não é câmbio ao vivo). */
export const USD_BRL_APROX = 5.4;

export interface ModeloOpenAi {
  value: string;
  label: string;
  descricao: string;
  precoInPor1M: number;
  precoOutPor1M: number;
}

export const MODELOS_OPENAI: readonly ModeloOpenAi[] = [
  {
    value: "gpt-5.6-terra",
    label: "GPT-5.6 Terra (recomendado)",
    descricao: "Equilíbrio entre qualidade e custo — ≈ R$ 0,15 por análise.",
    precoInPor1M: 2.5,
    precoOutPor1M: 15,
  },
  {
    value: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    descricao: "Rápido e econômico — ≈ R$ 0,06 por análise. Bom para alto volume.",
    precoInPor1M: 1,
    precoOutPor1M: 6,
  },
  {
    value: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    descricao: "Máxima qualidade — ≈ R$ 0,30 por análise. Para pareceres impecáveis.",
    precoInPor1M: 5,
    precoOutPor1M: 30,
  },
  {
    value: "gpt-5.4",
    label: "GPT-5.4",
    descricao: "Geração anterior — ≈ R$ 0,15 por análise. Só por compatibilidade.",
    precoInPor1M: 2.5,
    precoOutPor1M: 15,
  },
] as const;

/** Custo estimado em US$ de uma chamada. Modelo desconhecido usa o preço do Terra. */
export function custoUsd(modelo: string, tokensIn: number, tokensOut: number): number {
  const m = MODELOS_OPENAI.find((x) => x.value === modelo) ?? MODELOS_OPENAI[0];
  return (tokensIn * m.precoInPor1M + tokensOut * m.precoOutPor1M) / 1_000_000;
}
