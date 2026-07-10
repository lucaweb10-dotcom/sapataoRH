// Preview "como a IA vai ler suas respostas" (Config > IA) — monta o MESMO
// system prompt da análise de perfil, com os valores vivos do formulário.
// Módulo neutro (sem imports server) — roda no client.
import { DEFAULT_CRITERIOS, type CargoIa, type Criterios, type CriteriosGerais } from "./criterios-shared";
import { INSTRUCAO_JSON, blocoCargo, blocosGerais } from "./prompt";
import { PERSONA_PERFIL } from "@/lib/perfil/prompt";

/** System prompt de preview a partir das respostas do questionário + cargo escolhido. */
export function montarPromptPreview(gerais: CriteriosGerais, cargo: CargoIa | null): string {
  const criterios: Criterios = {
    prompt_base: DEFAULT_CRITERIOS.prompt_base,
    criterios: [],
    gerais,
    modelo: "",
  };
  return [
    criterios.prompt_base,
    "",
    PERSONA_PERFIL,
    "",
    ...blocoCargo(cargo, null),
    ...blocosGerais(criterios),
    INSTRUCAO_JSON,
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}
