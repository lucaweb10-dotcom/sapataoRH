// Move pós-análise de IA (forward-only, por marcador estável) — extraído do
// route cv/analyze na SP3b para ser compartilhado com a análise de perfil.

export const ETAPA_IA_MARCADOR = "ia_concluida";
export const ETAPA_IA_NOME = "Análise IA Concluída";
export const OBSERVACAO_MOVE_IA = "Movido pela análise de IA";

export interface EtapaResumo {
  id: string;
  nome: string;
  ordem: number;
  marcador: string | null;
}

export interface MoverIaDeps {
  getFunilDefault: (empresaId: string) => Promise<{ id: string } | null>;
  getEtapas: (funilId: string) => Promise<EtapaResumo[]>;
  updateEtapa: (candidatoId: string, etapaId: string) => Promise<{ error: unknown | null }>;
  insertHistory: (row: {
    deEtapa: string | null;
    paraEtapa: string;
    observacao: string;
  }) => Promise<{ error: unknown | null }>;
}

export interface MoverIaInput {
  empresaId: string;
  candidatoId: string;
  etapaAtualId: string | null;
}

/**
 * Resolve o funil default da empresa e move o candidato para a etapa marcada
 * como `ia_concluida` (fallback pelo nome). Forward-only: nunca retrocede um
 * card já adiantado; conservador se a etapa atual não pertence ao funil.
 * Retorna true se moveu (p/ o feedback "card movido" na UI).
 */
export async function moverParaIaConcluida(input: MoverIaInput, deps: MoverIaDeps): Promise<boolean> {
  const funil = await deps.getFunilDefault(input.empresaId);
  if (!funil) return false;

  const etapas = await deps.getEtapas(funil.id);
  const alvo =
    etapas.find((e) => e.marcador === ETAPA_IA_MARCADOR) ?? etapas.find((e) => e.nome === ETAPA_IA_NOME);
  if (!alvo) return false;

  const atual = input.etapaAtualId ? etapas.find((e) => e.id === input.etapaAtualId) : null;
  // conservador: se o candidato tem etapa mas ela não está neste funil, não move.
  if (input.etapaAtualId && !atual) return false;
  // forward-only: não retrocede um card já adiantado.
  if (atual && atual.ordem >= alvo.ordem) return false;

  const { error } = await deps.updateEtapa(input.candidatoId, alvo.id);
  if (error) return false;
  await deps.insertHistory({
    deEtapa: input.etapaAtualId,
    paraEtapa: alvo.id,
    observacao: OBSERVACAO_MOVE_IA,
  });
  return true;
}
