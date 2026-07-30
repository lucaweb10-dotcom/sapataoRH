// Validador de estilo das mensagens que a IA manda para o candidato.
//
// Isto é CÓDIGO, não instrução de prompt: instrução o modelo desobedece, regex
// não. Toda saída passa por aqui antes de virar mensagem no WhatsApp.

/** Travessão e meia-risca: a assinatura mais óbvia de texto gerado por IA. */
export const TRAVESSOES = /[—–]/;

/** Marcação que ninguém digita no WhatsApp. */
export const MARKDOWN = /(\*\*|^\s*[-*]\s+|^#{1,6}\s)/m;

/** Frasear de atendimento corporativo — soa a robô ou a e-mail formal. */
export const EXPRESSOES_BANIDAS = [
  "prezado",
  "prezada",
  "estamos à disposição",
  "fico à disposição",
  "ficamos à disposição",
  "conforme mencionado",
  "conforme informado",
  "venho por meio deste",
  "agradecemos o contato",
  "agradeço o contato",
  "informamos que",
  "solicitamos que",
  "atenciosamente",
  "cordialmente",
  "desde já agradeço",
  "espero ter ajudado",
  "posso ajudar em mais alguma coisa",
  "como posso ajudá-lo",
  "como posso ajudá-la",
  "sinta-se à vontade",
  "não hesite em",
];

export const MAX_MENSAGEM_CHARS = 300;
/** Uma pergunta por vez: duas já viram interrogatório. */
export const MAX_PERGUNTAS = 1;

export type ViolacaoEstilo =
  | "vazia"
  | "travessao"
  | "markdown"
  | "corporativo"
  | "longa"
  | "multiplas_perguntas";

export const VIOLACAO_DESCRICAO: Record<ViolacaoEstilo, string> = {
  vazia: "mensagem vazia",
  travessao: "usou travessão (—/–), que entrega que é IA",
  markdown: "usou markdown (**, lista, título)",
  corporativo: "usou expressão corporativa de robô",
  longa: `passou de ${MAX_MENSAGEM_CHARS} caracteres`,
  multiplas_perguntas: "fez mais de uma pergunta na mesma mensagem",
};

function contarPerguntas(texto: string): number {
  return (texto.match(/\?/g) ?? []).length;
}

export function violacoesDe(texto: string): ViolacaoEstilo[] {
  const v: ViolacaoEstilo[] = [];
  const t = texto.trim();
  if (!t) return ["vazia"];
  if (TRAVESSOES.test(t)) v.push("travessao");
  if (MARKDOWN.test(t)) v.push("markdown");

  const minusculo = t.toLowerCase();
  if (EXPRESSOES_BANIDAS.some((e) => minusculo.includes(e))) v.push("corporativo");

  if (t.length > MAX_MENSAGEM_CHARS) v.push("longa");
  if (contarPerguntas(t) > MAX_PERGUNTAS) v.push("multiplas_perguntas");
  return v;
}

export function estiloOk(texto: string): boolean {
  return violacoesDe(texto).length === 0;
}

/**
 * Conserta o que dá para consertar mecanicamente: travessão e markdown.
 *
 * O que NÃO conserta (tom corporativo, tamanho, excesso de pergunta) precisa de
 * outra geração — reescrever isso no braço mudaria o sentido da mensagem.
 */
export function sanitizarEstilo(texto: string): string {
  return texto
    .replace(/\s*[—–]\s*/g, ", ")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*]\s+/gm, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/,\s*,/g, ",")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Instrução de correção mandada ao modelo na segunda tentativa. */
export function instrucaoCorrecao(violacoes: ViolacaoEstilo[]): string {
  const itens = violacoes.map((v) => `- ${VIOLACAO_DESCRICAO[v]}`).join("\n");
  return [
    "Sua mensagem anterior quebrou as regras de estilo:",
    itens,
    "",
    "Reescreva a mensagem corrigindo isso. Continue curta, humana e com no máximo",
    "uma pergunta. Nada de travessão, markdown ou linguagem formal.",
  ].join("\n");
}

export type ResultadoEstilo =
  | { ok: true; texto: string; sanitizada: boolean }
  | { ok: false; violacoes: ViolacaoEstilo[] };

/**
 * Pipeline completo: valida, tenta sanitizar o que é mecânico, revalida.
 * `sanitizada: true` avisa o chamador de que a saída bruta estava fora do padrão
 * (vale registrar, porque se acontecer sempre é sinal de prompt ruim).
 */
export function aplicarEstilo(texto: string): ResultadoEstilo {
  const brutas = violacoesDe(texto);
  if (brutas.length === 0) return { ok: true, texto: texto.trim(), sanitizada: false };

  const limpo = sanitizarEstilo(texto);
  const restantes = violacoesDe(limpo);
  if (restantes.length === 0) return { ok: true, texto: limpo, sanitizada: true };
  return { ok: false, violacoes: restantes };
}
