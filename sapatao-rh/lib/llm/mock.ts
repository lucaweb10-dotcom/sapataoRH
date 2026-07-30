import type { LlmProvider } from "./types";

/** Stable, content-derived pseudo-score (35..94) — deterministic, no randomness. */
function hashScore(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return 35 + (h % 60);
}

/** Detecta o schema pela forma, não pelo nome — evita acoplar o mock a lib/triagem. */
function pareceTriagem(schema?: { name: string; schema: Record<string, unknown> }): boolean {
  const props = schema?.schema?.properties;
  return !!props && typeof props === "object" && "mensagem" in props && "proximo_estado" in props;
}

/**
 * Roteiro determinístico da triagem: avança conforme o nº de falas do candidato
 * já presentes no transcript. Sem travessão e sem markdown — o validador de
 * estilo roda por cima disto igual roda na saída real.
 */
const ROTEIRO_MOCK = [
  { mensagem: "oi! aqui é do RH do posto. você tá procurando vaga com a gente?", proximo_estado: "perguntando" },
  { mensagem: "legal. qual função você tem interesse?", proximo_estado: "perguntando" },
  { mensagem: "entendi. você já trabalhou com atendimento ao público antes?", proximo_estado: "perguntando" },
  { mensagem: "e como você se desloca até a unidade?", proximo_estado: "perguntando" },
  { mensagem: "perfeito. consegue me mandar seu currículo por aqui?", proximo_estado: "aguardando_cv" },
  { mensagem: "recebi, obrigada! vou passar pro RH analisar e a gente te retorna.", proximo_estado: "concluida" },
] as const;

/**
 * Deterministic mock LLM: returns a plausible, schema-valid parecer derived from
 * the prompt text. No network. Lets the whole pipeline run + be demoed before a
 * real provider key is plugged in (SP3b). Same input → same output.
 */
export const mockProvider: LlmProvider = {
  modelo: "mock",

  async completeChat(_system, mensagens) {
    const ultima = mensagens.filter((m) => m.role === "user").at(-1)?.conteudo ?? "";
    const texto =
      `Resposta simulada (mock) para: "${ultima.slice(0, 80)}". ` +
      "Sem provedor real configurado, então isto não reflete o histórico do candidato.";
    const chars = mensagens.reduce((n, m) => n + m.conteudo.length, 0);
    return { texto, tokensEst: Math.max(1, Math.ceil(chars / 4)) };
  },

  async completeJson(_system, user, opts) {
    if (pareceTriagem(opts?.jsonSchema)) {
      // Quantas vezes o candidato já falou define o passo — determinístico.
      // O rótulo vem do montarTranscript: "[dd/mm/aaaa hh:mm] Candidato: ...".
      const falas = (user.match(/\]\s*Candidato:/g) ?? []).length;
      const passo = Math.min(Math.max(falas - 1, 0), ROTEIRO_MOCK.length - 1);
      const turno = ROTEIRO_MOCK[passo];
      return {
        json: JSON.stringify({
          mensagem: turno.mensagem,
          proximo_estado: turno.proximo_estado,
          campos: {},
          intencao: "normal",
          motivo_handoff: null,
        }),
        tokensEst: Math.max(1, Math.ceil(user.length / 4)),
      };
    }

    const score = hashScore(user);
    const verdict = score >= 70 ? "apto" : score >= 40 ? "atencao" : "inapto";
    const temExperiencia = score >= 55;
    const parecer = {
      score,
      verdict,
      criterios_atendidos: [
        {
          criterio: "Idade igual ou maior que 18 anos",
          atendido: true,
          evidencia: "Indícios no currículo (simulado)",
          fonte: "curriculo",
        },
        {
          criterio: "Experiência em atendimento ao público",
          atendido: temExperiencia,
          evidencia: temExperiencia ? "Experiência relatada no currículo" : "Não evidenciado no currículo",
          fonte: temExperiencia ? "curriculo" : "nao_consta",
        },
        {
          criterio: "Disponibilidade de horário",
          atendido: score % 2 === 0,
          evidencia: "A confirmar na entrevista",
          fonte: score % 2 === 0 ? "conversa" : "nao_consta",
        },
      ],
      contradicoes: [],
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
