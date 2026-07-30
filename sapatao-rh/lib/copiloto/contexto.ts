// Builder puro do contexto do copiloto: tudo que a IA pode saber sobre o
// candidato aberto. Nada aqui toca banco — o orquestrador injeta os dados.
import { montarTranscript, type TranscriptMsg } from "@/lib/perfil/transcript";

/** Teto do transcript no copiloto: menor que o da análise, porque a pergunta do
 *  gestor e o histórico da própria thread também ocupam contexto. */
export const MAX_TRANSCRIPT_COPILOTO = 16_000;

export interface CandidatoContexto {
  nome: string;
  telefone: string;
  idade: number | null;
  endereco: string | null;
  cep: string | null;
  tem_veiculo: boolean | null;
  vaga_interesse: string | null;
  status: string;
  tags: string[];
  score_ia: number | null;
  parecer_ia: Record<string, unknown> | null;
  curriculo_url: string | null;
  etapa_nome: string | null;
  unidade_nome: string | null;
  notas_internas: string | null;
}

function simNao(v: boolean | null): string {
  return v === null ? "não informado" : v ? "sim" : "não";
}

function cadastro(c: CandidatoContexto): string {
  const linhas = [
    `Nome: ${c.nome}`,
    `Telefone: ${c.telefone}`,
    `Idade: ${c.idade ?? "não informado"}`,
    `Endereço: ${c.endereco ?? "não informado"}`,
    `CEP: ${c.cep ?? "não informado"}`,
    `Tem veículo: ${simNao(c.tem_veiculo)}`,
    `Vaga de interesse: ${c.vaga_interesse ?? "não informado"}`,
    `Unidade: ${c.unidade_nome ?? "não definida"}`,
    `Etapa no funil: ${c.etapa_nome ?? "não definida"}`,
    `Status: ${c.status}`,
  ];
  if (c.tags.length) linhas.push(`Tags: ${c.tags.join(", ")}`);
  if (c.curriculo_url) linhas.push("Currículo: anexado");
  return linhas.join("\n");
}

function parecer(c: CandidatoContexto): string {
  if (c.score_ia === null && !c.parecer_ia) return "Nenhuma análise de IA foi feita ainda.";
  const partes: string[] = [];
  if (c.score_ia !== null) partes.push(`Score: ${c.score_ia}/100`);
  if (c.parecer_ia) partes.push(JSON.stringify(c.parecer_ia));
  return partes.join("\n");
}

export const SYSTEM_COPILOTO = [
  "Você é o copiloto de um gestor de RH de uma rede de postos de combustível.",
  "O gestor conversa com você sobre UM candidato específico. Esta conversa é privada:",
  "o candidato nunca vê o que você escreve aqui.",
  "",
  "REGRAS:",
  "- Responda SOMENTE com base no CONTEXTO abaixo. Ele é tudo que você sabe.",
  "- Se a informação não estiver no contexto, diga que não consta. Nunca deduza",
  "  experiência, salário, empresa, data ou qualificação que não esteja escrita.",
  "- Ao afirmar algo sobre o candidato, diga de onde veio: da conversa, do currículo",
  "  ou do cadastro.",
  "- Seja direto e curto. O gestor está no meio do expediente.",
  "- Português do Brasil.",
  "- Você não envia mensagem para o candidato e não executa ação nenhuma no sistema.",
  "  Se pedirem isso, explique que só o gestor pode fazer.",
].join("\n");

/** Monta o bloco de contexto que vai como primeira mensagem da thread. */
export function buildContextoCopiloto(
  candidato: CandidatoContexto,
  mensagens: TranscriptMsg[],
): string {
  const transcript = mensagens.length
    ? montarTranscript(mensagens, { maxChars: MAX_TRANSCRIPT_COPILOTO })
    : "Nenhuma mensagem trocada com este candidato ainda.";

  return [
    "=== CONTEXTO DO CANDIDATO ===",
    "",
    "--- CADASTRO (preenchido no sistema) ---",
    cadastro(candidato),
    "",
    "--- ANÁLISE DE IA (se houver) ---",
    parecer(candidato),
    "",
    candidato.notas_internas ? `--- NOTAS INTERNAS DO RH ---\n${candidato.notas_internas}\n` : "",
    "--- CONVERSA NO WHATSAPP ---",
    transcript,
    "",
    "=== FIM DO CONTEXTO ===",
  ]
    .filter(Boolean)
    .join("\n");
}
