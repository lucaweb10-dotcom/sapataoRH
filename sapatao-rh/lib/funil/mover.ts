export interface MoverDeps {
  getCandidato: (id: string) => Promise<{ etapa_id: string | null; empresa_id: string } | null>;
  getEtapa: (
    id: string,
  ) => Promise<{ empresa_id: string; is_terminal: boolean; status_destino: string | null } | null>;
  updateEtapa: (
    candidatoId: string,
    etapaId: string,
    statusTerminal: string | null,
  ) => Promise<{ error: { message?: string } | null }>;
  insertHistory: (row: {
    candidatoId: string;
    deEtapa: string | null;
    paraEtapa: string;
    movidoPor: string;
    observacao?: string;
  }) => Promise<{ error: { message?: string } | null }>;
}

export interface MoverInput {
  empresaId: string;
  candidatoId: string;
  paraEtapaId: string;
  movidoPor: string;
  observacao?: string;
}

export type MoverResult = { ok: true } | { ok: false; error: "not_found" | "cross_tenant" | "update_failed" };

/**
 * Moves a candidato to a target stage (write-first), then logs kanban_history.
 * Tenant-scoped: the candidato and the destination stage must belong to
 * `empresaId`. Terminal stages also flip candidato.status (via statusTerminal).
 * History is only logged after a successful update.
 */
export async function moverCandidato(input: MoverInput, deps: MoverDeps): Promise<MoverResult> {
  const cand = await deps.getCandidato(input.candidatoId);
  if (!cand || cand.empresa_id !== input.empresaId) return { ok: false, error: "not_found" };

  const etapa = await deps.getEtapa(input.paraEtapaId);
  if (!etapa) return { ok: false, error: "not_found" };
  if (etapa.empresa_id !== input.empresaId) return { ok: false, error: "cross_tenant" };

  const upd = await deps.updateEtapa(input.candidatoId, input.paraEtapaId, etapa.status_destino);
  if (upd.error) return { ok: false, error: "update_failed" };

  await deps.insertHistory({
    candidatoId: input.candidatoId,
    deEtapa: cand.etapa_id,
    paraEtapa: input.paraEtapaId,
    movidoPor: input.movidoPor,
    observacao: input.observacao,
  });
  return { ok: true };
}
