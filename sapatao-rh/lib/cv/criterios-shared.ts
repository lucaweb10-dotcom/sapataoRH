// Parte PURA dos critérios de IA (schemas, defaults, resolver) — módulo neutro,
// sem import de supabase/server, para poder ser usado em client components
// (preview do prompt, forms) sem puxar código server para o bundle.
import { z } from "zod";

const listaCriterios = z.array(z.string().min(1).max(200)).max(20).default([]);

export const criteriosGeraisSchema = z.object({
  versao: z.literal(2),
  nao_eliminar: listaCriterios, // anti-viés: fatores que NÃO devem eliminar/derrubar nota
  distancia_max: z.string().max(200).default(""), // ex.: "até 17 min (~8 km) da unidade"
  unidades: listaCriterios, // "Nome — endereço", uma por linha
  contexto: z.string().max(4000).default(""), // instruções extras da empresa
});
export type CriteriosGerais = z.infer<typeof criteriosGeraisSchema>;

export const criteriosCargoSchema = z.object({
  eliminatorios: listaCriterios,
  desejaveis: listaCriterios,
  pontos_sucesso: listaCriterios,
  pontos_baixa: listaCriterios,
  contexto_cargo: z.string().max(2000).default(""),
});
export type CriteriosCargo = z.infer<typeof criteriosCargoSchema>;

export interface CargoIa {
  id: string;
  nome: string;
  criterios: CriteriosCargo;
}

export interface Criterios {
  prompt_base: string;
  /** Lista flat p/ o prompt de CV legado (v1, ou derivada dos gerais quando v2). */
  criterios: string[];
  /** Preenchido quando a empresa já respondeu o questionário v2; null = legado/default. */
  gerais: CriteriosGerais | null;
  modelo: string;
}

export const DEFAULT_CRITERIOS: Criterios = {
  prompt_base:
    "Você é um analista de RH da Estação Sapatão (rede de postos de combustível). " +
    "Avalie a aderência do candidato às vagas operacionais (Atendente, Frentista, Caixa, Cozinha).",
  criterios: [
    "Idade igual ou maior que 18 anos",
    "Reside a uma distância razoável da unidade (locomoção viável)",
    "Possui veículo próprio ou meio de locomoção",
    "Experiência em atendimento ao público",
    "Disponibilidade de horário, incluindo turnos",
  ],
  gerais: null,
  modelo: "mock",
};

/** Cargos padrão de posto, pré-preenchidos e editáveis (inseridos via action da UI). */
export const CARGOS_PADRAO: { nome: string; criterios: CriteriosCargo }[] = [
  {
    nome: "Frentista",
    criterios: {
      eliminatorios: ["Ter 18 anos ou mais", "Disponibilidade para turnos, incluindo madrugada"],
      desejaveis: ["Experiência em atendimento ao público", "Já ter trabalhado em posto de combustível"],
      pontos_sucesso: ["Morar perto da unidade", "Curso de NR-20 ou disposição para fazer"],
      pontos_baixa: ["Nunca ter trabalhado com atendimento ao público"],
      contexto_cargo: "Atendimento na pista: abastecimento, troca de óleo simples, cortesia com o cliente.",
    },
  },
  {
    nome: "Caixa",
    criterios: {
      eliminatorios: ["Ter 18 anos ou mais", "Ensino fundamental completo"],
      desejaveis: ["Experiência com operação de caixa e fechamento", "Já ter operado máquina de cartão"],
      pontos_sucesso: ["Experiência em loja de conveniência ou varejo"],
      pontos_baixa: ["Sem nenhuma experiência com dinheiro/PDV"],
      contexto_cargo: "Operação de PDV, fechamento de caixa e atendimento no balcão da conveniência.",
    },
  },
  {
    nome: "Atendente",
    criterios: {
      eliminatorios: ["Ter 18 anos ou mais", "Disponibilidade para escala 6x1, incluindo fins de semana"],
      desejaveis: ["Experiência em atendimento ao público", "Experiência em loja de conveniência"],
      pontos_sucesso: ["Simpatia e proatividade evidenciadas", "Morar perto da unidade"],
      pontos_baixa: ["Restrição de horário não informada claramente"],
      contexto_cargo: "Atendimento na conveniência: reposição, organização e caixa auxiliar.",
    },
  },
  {
    nome: "Cozinha",
    criterios: {
      eliminatorios: ["Ter 18 anos ou mais"],
      desejaveis: ["Experiência com chapa e lanches", "Noções de organização de praça e boas práticas"],
      pontos_sucesso: ["Experiência em cozinha de alto fluxo"],
      pontos_baixa: ["Sem nenhuma experiência com preparo de alimentos"],
      contexto_cargo: "Preparo de lanches e salgados da conveniência; organização e limpeza da praça.",
    },
  },
];

/** Deriva a lista flat (compat v1) a partir dos critérios gerais v2. */
export function flatDosGerais(gerais: CriteriosGerais): string[] {
  const flat: string[] = [];
  if (gerais.distancia_max) flat.push(`Reside dentro do limite de distância: ${gerais.distancia_max}`);
  for (const item of gerais.nao_eliminar) flat.push(`[Não eliminar por] ${item}`);
  return flat.length > 0 ? flat : DEFAULT_CRITERIOS.criterios;
}

// ---------------------------------------------------------------------------
// Resolução híbrida do cargo (decisão do usuário, 2026-07-10)
// ---------------------------------------------------------------------------

export type CargoResolvido =
  | { tipo: "match"; cargo: CargoIa }
  | { tipo: "unico"; cargo: CargoIa }
  | { tipo: "nenhum" }
  | { tipo: "ambiguo" };

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Match = nome do cargo (normalizado) igual OU contido na vaga de interesse —
 * mas só quando EXATAMENTE UM cargo casa (dois nomes na mesma vaga = ambíguo,
 * nunca escolher em silêncio). 1 cargo ativo → "unico"; 0 cargos → "nenhum"
 * (análise geral); sem match com >1 cargo → "ambiguo" (a UI exige escolha).
 */
export function resolverCargo(cargos: CargoIa[], vagaInteresse: string | null): CargoResolvido {
  if (cargos.length === 0) return { tipo: "nenhum" };
  if (vagaInteresse) {
    const vaga = normalizar(vagaInteresse);
    const matches = cargos.filter((c) => {
      const nome = normalizar(c.nome);
      return nome === vaga || vaga.includes(nome);
    });
    if (matches.length === 1) return { tipo: "match", cargo: matches[0] };
    if (matches.length > 1) return { tipo: "ambiguo" };
  }
  if (cargos.length === 1) return { tipo: "unico", cargo: cargos[0] };
  return { tipo: "ambiguo" };
}
