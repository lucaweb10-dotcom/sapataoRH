// Builder do prompt de análise de PERFIL (conversa inteira) — SP3b.
// Compõe: prompt_base + persona + bloco do CARGO + blocos GERAIS + instrução JSON
// (blocos compartilhados com o prompt de CV em lib/cv/prompt.ts).
import type { CargoIa, Criterios } from "@/lib/cv/criterios-shared";
import { INSTRUCAO_JSON, blocoCargo, blocosGerais } from "@/lib/cv/prompt";

export const PERSONA_PERFIL =
  "Você está avaliando o PERFIL COMPLETO de um candidato a partir do histórico de uma conversa de WhatsApp entre o RH e o candidato. " +
  "Áudios aparecem transcritos no texto; pode haver currículo em PDF e imagens ANEXADOS a esta requisição — considere-os. " +
  'Sempre justifique com evidência do que foi dito/enviado. Informação ausente = "não informado" — NUNCA invente.';

export const MAX_DOC_CHARS = 12_000; // por documento extraído (DOCX)
export const MAX_DOCS = 2;

export interface PerfilCandidato {
  nome: string;
  telefone: string;
  vaga_interesse: string | null;
  idade: number | null;
  cep: string | null;
  endereco: string | null;
  tem_veiculo: boolean | null;
  tags: string[];
  notas_internas: string | null;
}

/** Monta o par (system, user) da análise de perfil por conversa. */
export function buildPerfilPrompt(
  criterios: Criterios,
  cargo: CargoIa | null,
  candidato: PerfilCandidato,
  transcript: string,
  docsTexto: { nome: string; texto: string }[],
): { system: string; user: string } {
  const system = [
    criterios.prompt_base,
    "",
    PERSONA_PERFIL,
    "",
    ...blocoCargo(cargo, candidato.vaga_interesse),
    ...blocosGerais(criterios),
    INSTRUCAO_JSON,
  ].join("\n");

  const dados = [
    "Dados do candidato (cadastro):",
    `- Nome: ${candidato.nome}`,
    `- Telefone: ${candidato.telefone}`,
    `- Vaga de interesse: ${candidato.vaga_interesse ?? "não informada"}`,
    `- Idade: ${candidato.idade ?? "não informada"}`,
    `- CEP: ${candidato.cep ?? "não informado"}`,
    `- Endereço: ${candidato.endereco ?? "não informado"}`,
    `- Tem veículo: ${candidato.tem_veiculo === null ? "não informado" : candidato.tem_veiculo ? "sim" : "não"}`,
    `- Tags: ${candidato.tags.length > 0 ? candidato.tags.join(", ") : "nenhuma"}`,
    `- Notas internas do RH: ${candidato.notas_internas ?? "nenhuma"}`,
  ];

  const docs: string[] = [];
  for (const doc of docsTexto.slice(0, MAX_DOCS)) {
    const texto =
      doc.texto.length > MAX_DOC_CHARS ? doc.texto.slice(0, MAX_DOC_CHARS) + "\n…[truncado]" : doc.texto;
    docs.push(`--- ${doc.nome} ---`, texto);
  }

  const user = [
    ...dados,
    "",
    "Conversa (WhatsApp):",
    transcript,
    ...(docs.length > 0 ? ["", "ANEXOS (texto extraído):", ...docs] : []),
  ].join("\n");

  return { system, user };
}
