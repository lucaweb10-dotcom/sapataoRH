import type { Criterios } from "./criterios";

const MAX_CV_CHARS = 12000;

/** Builds the (system, user) prompt pair for CV analysis from the empresa's
 *  criteria, the candidate's vaga of interest, and the extracted CV text. */
export function buildCvPrompt(
  criterios: Criterios,
  vagaInteresse: string | null,
  cvTexto: string,
): { system: string; user: string } {
  const lista = criterios.criterios.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const system = [
    criterios.prompt_base,
    "",
    "Critérios de avaliação:",
    lista,
    "",
    'Responda SOMENTE com um objeto JSON válido neste formato: { "score" (0-100 inteiro), ' +
      '"verdict" ("apto"|"atencao"|"inapto"), "criterios_atendidos" [{"criterio","atendido","evidencia"}], ' +
      '"pontos_fortes" [string], "pontos_atencao" [string], "experiencia_relevante" (string), ' +
      '"resumo" (string), "perguntas_sugeridas_entrevista" [string] }.',
  ].join("\n");

  const cv =
    cvTexto.length > MAX_CV_CHARS ? cvTexto.slice(0, MAX_CV_CHARS) + "\n…[truncado]" : cvTexto;
  const user = [
    `Vaga de interesse do candidato: ${vagaInteresse ?? "não informada"}`,
    "",
    "Currículo (texto extraído):",
    cv,
  ].join("\n");

  return { system, user };
}
