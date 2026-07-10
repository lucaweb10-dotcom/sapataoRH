// Remapeamento de etapa entre funis (SP7): quando o candidato troca de unidade,
// o card migra p/ a etapa EQUIVALENTE do funil de destino (decisão do usuário).
// Puro/testável — a escrita fica na action.

export interface EtapaMapeavel {
  id: string;
  nome: string;
  ordem: number;
  marcador: string | null;
  is_terminal: boolean;
  status_destino: string | null;
}

function normalizar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Etapa equivalente no funil de destino: (1) mesmo marcador (etapas de sistema);
 * (2) mesmo nome normalizado; (3) mesma POSIÇÃO na ordem, considerando SÓ as
 * etapas NÃO-terminais (nunca aterrissar em Contratado/Reprovado por acidente
 * de posição — clamp na última não-terminal); (4) 1ª etapa não-terminal.
 * Origem TERMINAL sem equivalente (marcador/nome) → null: o candidato encerrado
 * NÃO é re-encaixado no pipeline — mantém a etapa antiga (e o status).
 * Null também quando o destino não tem etapas utilizáveis.
 * Origem === destino (etapa já é do funil de destino) → mantém.
 */
export function mapearEtapaEquivalente(
  etapaAtualId: string | null,
  etapasOrigem: EtapaMapeavel[],
  etapasDestino: EtapaMapeavel[],
): string | null {
  if (etapasDestino.length === 0) return null;
  const destinoOrdenado = [...etapasDestino].sort((a, b) => a.ordem - b.ordem);
  const destinoNaoTerminal = destinoOrdenado.filter((e) => !e.is_terminal);

  if (!etapaAtualId) return destinoNaoTerminal[0]?.id ?? null;

  // já está no funil de destino → não move
  if (destinoOrdenado.some((e) => e.id === etapaAtualId)) return etapaAtualId;

  const origemOrdenada = [...etapasOrigem].sort((a, b) => a.ordem - b.ordem);
  const atual = origemOrdenada.find((e) => e.id === etapaAtualId);
  if (!atual) return destinoNaoTerminal[0]?.id ?? null;

  if (atual.marcador) {
    const porMarcador = destinoOrdenado.find((e) => e.marcador === atual.marcador);
    if (porMarcador) return porMarcador.id;
  }

  const nomeAtual = normalizar(atual.nome);
  const porNome = destinoOrdenado.find((e) => normalizar(e.nome) === nomeAtual);
  if (porNome) return porNome.id;

  // Terminal sem equivalente explícito: não re-encaixar no pipeline.
  if (atual.is_terminal) return null;

  const origemNaoTerminal = origemOrdenada.filter((e) => !e.is_terminal);
  const idx = origemNaoTerminal.findIndex((e) => e.id === etapaAtualId);
  if (destinoNaoTerminal.length === 0) return null;
  return destinoNaoTerminal[Math.min(Math.max(idx, 0), destinoNaoTerminal.length - 1)].id;
}

/** Status total (mesma regra do mover): etapa terminal → status_destino;
 *  não-terminal → 'ativo'. Null = não mexer no status. */
export function statusAposMigracao(etapaDestino: EtapaMapeavel | undefined): string | null {
  if (!etapaDestino) return null;
  if (etapaDestino.is_terminal) return etapaDestino.status_destino;
  return "ativo";
}
