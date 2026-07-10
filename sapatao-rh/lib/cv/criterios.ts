// Leituras server-side dos critérios de IA. As partes puras (schemas, defaults,
// resolverCargo, CARGOS_PADRAO) vivem em criterios-shared.ts (módulo neutro,
// importável em client components) e são re-exportadas daqui por compat.
import { createClient } from "@/lib/supabase/server";
import type { IaCargo } from "@/types/database";
import {
  DEFAULT_CRITERIOS,
  criteriosCargoSchema,
  criteriosGeraisSchema,
  flatDosGerais,
  type CargoIa,
  type Criterios,
} from "./criterios-shared";

export * from "./criterios-shared";

/** Loads the empresa's IA criteria (RLS-scoped); falls back to a sensible default. */
export async function getCriterios(empresaId: string): Promise<Criterios> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ia_criterios")
    .select("prompt_base, criterios, modelo")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  if (!data) return DEFAULT_CRITERIOS;

  const prompt_base = data.prompt_base || DEFAULT_CRITERIOS.prompt_base;
  const modelo = data.modelo || DEFAULT_CRITERIOS.modelo;

  // v1 legado: array de strings
  if (Array.isArray(data.criterios)) {
    return {
      prompt_base,
      criterios:
        data.criterios.length > 0 ? (data.criterios as string[]) : DEFAULT_CRITERIOS.criterios,
      gerais: null,
      modelo,
    };
  }

  // v2: objeto de critérios gerais
  const parsed = criteriosGeraisSchema.safeParse(data.criterios);
  if (!parsed.success) return { ...DEFAULT_CRITERIOS, prompt_base, modelo };
  return { prompt_base, criterios: flatDosGerais(parsed.data), gerais: parsed.data, modelo };
}

/** Cargos de avaliação ativos da empresa (RLS-scoped), com critérios validados. */
export async function listCargosIa(empresaId: string): Promise<CargoIa[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("ia_cargos")
    .select("id, nome, criterios, ativo")
    .eq("empresa_id", empresaId)
    .eq("ativo", true)
    .order("nome", { ascending: true });
  if (!data) return [];
  return (data as Pick<IaCargo, "id" | "nome" | "criterios" | "ativo">[]).map((row) => {
    const parsed = criteriosCargoSchema.safeParse(row.criterios);
    return {
      id: row.id,
      nome: row.nome,
      criterios: parsed.success ? parsed.data : criteriosCargoSchema.parse({}),
    };
  });
}
