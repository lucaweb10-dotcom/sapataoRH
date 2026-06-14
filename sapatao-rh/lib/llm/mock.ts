import type { LlmProvider } from "./types";

/** Stable, content-derived pseudo-score (35..94) — deterministic, no randomness. */
function hashScore(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return 35 + (h % 60);
}

/**
 * Deterministic mock LLM: returns a plausible, schema-valid parecer derived from
 * the prompt text. No network. Lets the whole pipeline run + be demoed before a
 * real provider key is plugged in (SP3b). Same input → same output.
 */
export const mockProvider: LlmProvider = {
  modelo: "mock",
  async completeJson(_system, user) {
    const score = hashScore(user);
    const verdict = score >= 70 ? "apto" : score >= 40 ? "atencao" : "inapto";
    const temExperiencia = score >= 55;
    const parecer = {
      score,
      verdict,
      criterios_atendidos: [
        { criterio: "Idade igual ou maior que 18 anos", atendido: true, evidencia: "Indícios no currículo (simulado)" },
        {
          criterio: "Experiência em atendimento ao público",
          atendido: temExperiencia,
          evidencia: temExperiencia ? "Experiência relatada no currículo" : "Não evidenciado no currículo",
        },
        { criterio: "Disponibilidade de horário", atendido: score % 2 === 0, evidencia: "A confirmar na entrevista" },
      ],
      pontos_fortes: temExperiencia
        ? ["Experiência prévia em atendimento", "Disponibilidade de horário"]
        : ["Disponibilidade de horário"],
      pontos_atencao: score < 70 ? ["Confirmar locomoção até a unidade"] : [],
      experiencia_relevante: temExperiencia
        ? "Experiência anterior em atendimento ao público (simulado)."
        : "Sem experiência relevante evidenciada (simulado).",
      resumo: `Análise simulada (mock): score ${score}/100, parecer "${verdict}". Validação humana recomendada.`,
      perguntas_sugeridas_entrevista: [
        "Como você se desloca até a unidade?",
        "Qual sua experiência com sistemas de PDV/caixa?",
      ],
    };
    return { json: JSON.stringify(parecer), tokensEst: Math.max(1, Math.ceil(user.length / 4)) };
  },
};
