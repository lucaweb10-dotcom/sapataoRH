import type { CargoIa, Criterios } from "./criterios-shared";

const MAX_CV_CHARS = 12000;

export const INSTRUCAO_FONTES = [
  "RASTREIE A ORIGEM DE CADA AFIRMAÇÃO. Em cada item de criterios_atendidos, preencha",
  '"fonte" com uma destas opções:',
  '- "conversa": o candidato afirmou isso nas mensagens (inclui áudio transcrito);',
  '- "curriculo": está escrito no currículo ou documento anexado;',
  '- "cadastro": veio dos dados do cadastro no sistema;',
  '- "nao_consta": nenhuma fonte confirma — nesse caso "atendido" não pode ser true.',
  "Não vale o mesmo peso: o que o candidato diz sobre si mesmo é menos verificável",
  "do que o que está documentado. Registre isso na evidência quando for relevante.",
  "",
  'Quando as fontes DIVERGIREM, preencha "contradicoes" com o tema, o que foi dito na',
  "conversa e o que consta na outra fonte. Não escolha um lado em silêncio: quem decide",
  "é o gestor. Sem divergência, devolva uma lista vazia.",
].join("\n");

export const INSTRUCAO_JSON =
  INSTRUCAO_FONTES +
  "\n\n" +
  'Responda SOMENTE com um objeto JSON válido neste formato: { "score" (0-100 inteiro), ' +
  '"verdict" ("apto"|"atencao"|"inapto"), "criterios_atendidos" [{"criterio","atendido","evidencia","fonte"}], ' +
  '"pontos_fortes" [string], "pontos_atencao" [string], "experiencia_relevante" (string), ' +
  '"resumo" (string), "perguntas_sugeridas_entrevista" [string], ' +
  '"contradicoes" [{"tema","na_conversa","em_outra_fonte"}] }.';

function lista(titulo: string, itens: string[]): string[] {
  if (itens.length === 0) return [];
  return [titulo, ...itens.map((c, i) => `${i + 1}. ${c}`), ""];
}

/** Bloco de critérios do CARGO avaliado (ou aviso de avaliação geral). */
export function blocoCargo(cargo: CargoIa | null, vagaInteresse: string | null): string[] {
  if (!cargo) {
    return [
      `Vaga avaliada: ${vagaInteresse ?? "não informada"} (avaliação geral — a empresa ainda não configurou critérios específicos deste cargo).`,
      "",
    ];
  }
  const c = cargo.criterios;
  const out: string[] = [`Vaga avaliada: ${cargo.nome}`, ""];
  out.push(
    ...lista('Critérios eliminatórios (se algum falhar: verdict "inapto" e score máximo 30):', c.eliminatorios),
  );
  out.push(...lista("Critérios desejáveis (somam pontos, não eliminam):", c.desejaveis));
  out.push(...lista("Pontos que aumentam a nota:", c.pontos_sucesso));
  out.push(...lista("Pontos que reduzem a nota (sem eliminar — vire pergunta de entrevista):", c.pontos_baixa));
  if (c.contexto_cargo) out.push("Contexto do cargo:", c.contexto_cargo, "");
  return out;
}

/** Blocos GERAIS da empresa (v2) ou lista flat numerada (v1 legado). */
export function blocosGerais(criterios: Criterios): string[] {
  const g = criterios.gerais;
  if (!g) {
    return lista("Critérios de avaliação da empresa:", criterios.criterios);
  }
  const out: string[] = [];
  out.push(...lista("NÃO elimine nem reduza a nota por estes fatores (trate como neutros):", g.nao_eliminar));
  if (g.distancia_max || g.unidades.length > 0) {
    out.push("Localização:");
    if (g.distancia_max) out.push(`- Limite de distância aceito: ${g.distancia_max}`);
    if (g.unidades.length > 0) {
      out.push("- Unidades da empresa:");
      for (const u of g.unidades) out.push(`  - ${u}`);
    }
    out.push(
      '- Compare o endereço/CEP/bairro do candidato com as unidades acima; sinalize se o limite for ultrapassado. Se não houver dados de endereço, marque como "não informado" — não invente.',
      "",
    );
  }
  if (g.contexto) out.push("Contexto da empresa:", g.contexto, "");
  return out;
}

/** Builds the (system, user) prompt pair for CV analysis from the empresa's
 *  criteria (+ optional cargo block), the candidate's vaga, and the CV text. */
export function buildCvPrompt(
  criterios: Criterios,
  vagaInteresse: string | null,
  cvTexto: string,
  cargo: CargoIa | null = null,
): { system: string; user: string } {
  const system = [
    criterios.prompt_base,
    "",
    ...blocoCargo(cargo, vagaInteresse),
    ...blocosGerais(criterios),
    INSTRUCAO_JSON,
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
