import { createClient } from "@/lib/supabase/server";

export interface Criterios {
  prompt_base: string;
  criterios: string[];
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
  modelo: "mock",
};

/** Loads the empresa's IA criteria (RLS-scoped); falls back to a sensible default. */
export async function getCriterios(empresaId: string): Promise<Criterios> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ia_criterios")
    .select("prompt_base, criterios, modelo")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!data) return DEFAULT_CRITERIOS;
  return {
    prompt_base: data.prompt_base || DEFAULT_CRITERIOS.prompt_base,
    criterios:
      Array.isArray(data.criterios) && data.criterios.length > 0
        ? (data.criterios as string[])
        : DEFAULT_CRITERIOS.criterios,
    modelo: data.modelo || DEFAULT_CRITERIOS.modelo,
  };
}
