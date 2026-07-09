// Substituição de variáveis de templates de mensagem (SP6). Função PURA (sem I/O)
// para ser testável — a query de templates fica em lib/chat/queries.ts.

export type DadosTemplate = {
  nome?: string | null;
  vaga?: string | null;
  unidade?: string | null;
};

/** Primeiro nome do candidato ("Ana Paula Souza" → "Ana"). */
export function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome.trim().split(/\s+/)[0] ?? "";
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/**
 * Preenche {{nome}} (primeiro nome), {{vaga}} e {{unidade}} no conteúdo.
 * Variável sem valor (ou desconhecida) é REMOVIDA — nunca sobra {{...}} no texto —
 * e o espaçamento/pontuação ao redor é normalizado.
 */
export function preencherTemplate(conteudo: string, dados: DadosTemplate): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(dados.nome),
    vaga: dados.vaga?.trim() ?? "",
    unidade: dados.unidade?.trim() ?? "",
  };
  return conteudo
    .replace(PLACEHOLDER, (_m, chave: string) => valores[chave.toLowerCase()] ?? "")
    .replace(/\{\{[^{}]*\}\}/g, "") // remove placeholders malformados ({{123}}, {{}}, {{a b}}, etc)
    .replace(/[ \t]{2,}/g, " ") // espaços duplos deixados por variáveis vazias
    .replace(/ ([,.!?;:])/g, "$1") // espaço órfão antes de pontuação
    .replace(/^[ \t]+|[ \t]+$/gm, ""); // sobras nas bordas de cada linha
}
