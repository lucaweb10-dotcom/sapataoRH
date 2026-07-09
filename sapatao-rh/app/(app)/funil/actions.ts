"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { moverCandidato, type MoverDeps, type MoverResult } from "@/lib/funil/mover";
import { getHistorico, type HistoricoEntry } from "@/lib/funil/queries";
import { moverSchema, notasSchema } from "@/lib/validations/funil";
import { entrevistaSchema, type EntrevistaInput } from "@/lib/validations/entrevista";
import type { Candidato, Entrevista } from "@/types/database";

function canWrite(role: string, platformAdmin: boolean): boolean {
  return platformAdmin || role === "admin" || role === "rh";
}

/** Moves a candidato to another stage (RLS-scoped via the user session client),
 *  logging kanban_history. admin/rh only. */
export async function moverCandidatoAction(input: {
  candidatoId: string;
  paraEtapaId: string;
  observacao?: string;
}): Promise<MoverResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "not_found" };
  }
  const parsed = moverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "not_found" };

  const supabase = await createClient();
  const deps: MoverDeps = {
    getCandidato: async (id) => {
      const { data } = await supabase
        .from("candidatos")
        .select("etapa_id, empresa_id")
        .eq("id", id)
        .maybeSingle();
      return (data as { etapa_id: string | null; empresa_id: string } | null) ?? null;
    },
    getEtapa: async (id) => {
      const { data } = await supabase
        .from("funil_etapas")
        .select("empresa_id, is_terminal, status_destino")
        .eq("id", id)
        .maybeSingle();
      return (data as { empresa_id: string; is_terminal: boolean; status_destino: string | null } | null) ?? null;
    },
    updateEtapa: async (candidatoId, etapaId, statusTerminal) => {
      // status é total: etapa terminal -> seu status_destino; não-terminal -> 'ativo'
      // (assim, reverter um move terminal acidental volta o candidato para 'ativo').
      const patch: Partial<Candidato> = {
        etapa_id: etapaId,
        etapa_entrou_em: new Date().toISOString(),
        status: (statusTerminal ?? "ativo") as Candidato["status"],
      };
      const { error } = await supabase.from("candidatos").update(patch).eq("id", candidatoId);
      return { error };
    },
    insertHistory: async (row) => {
      const { error } = await supabase.from("kanban_history").insert({
        empresa_id: profile.empresa_id,
        candidato_id: row.candidatoId,
        de_etapa: row.deEtapa,
        para_etapa: row.paraEtapa,
        movido_por: row.movidoPor,
        observacao: row.observacao ?? null,
      });
      return { error };
    },
  };

  const result = await moverCandidato(
    {
      empresaId: profile.empresa_id,
      candidatoId: parsed.data.candidatoId,
      paraEtapaId: parsed.data.paraEtapaId,
      movidoPor: profile.id,
      observacao: parsed.data.observacao,
    },
    deps,
  );
  if (result.ok) {
    revalidatePath("/funil");
    revalidatePath("/candidatos");
  }
  return result;
}

/** Saves a candidato's internal notes. admin/rh only. */
export async function salvarNotas(input: { candidatoId: string; notas: string }): Promise<{ ok: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { ok: false };
  const parsed = notasSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const supabase = await createClient();
  const { error } = await supabase
    .from("candidatos")
    .update({ notas_internas: parsed.data.notas })
    .eq("id", parsed.data.candidatoId);
  if (error) {
    console.error("[funil/actions] salvarNotas error:", error);
    return { ok: false };
  }
  revalidatePath("/funil");
  revalidatePath("/candidatos");
  return { ok: true };
}

/** Loads a candidato's stage-move history (RLS-scoped) for the modal. */
export async function carregarHistorico(candidatoId: string): Promise<HistoricoEntry[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  return getHistorico(candidatoId);
}

/** Agenda uma entrevista para o candidato (insere sempre; mais recente = vigente). */
export async function agendarEntrevista(
  candidatoId: string,
  input: EntrevistaInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && profile.role !== "rh" && !profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }

  const parsed = entrevistaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();

  // Valida que o candidato pertence à empresa (RLS cobre, mas verificamos explicitamente)
  const { data: cand } = await supabase
    .from("candidatos")
    .select("empresa_id")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!cand) return { ok: false, error: "forbidden" };

  const { error } = await supabase.from("entrevistas").insert({
    empresa_id: cand.empresa_id,
    candidato_id: candidatoId,
    data_hora: new Date(parsed.data.data_hora).toISOString(),
    formato: parsed.data.formato,
    local_ou_link: parsed.data.local_ou_link ?? null,
    observacoes: parsed.data.observacoes ?? null,
    criado_por: profile.id,
  });

  if (error) {
    console.error("[funil/actions] agendarEntrevista:", error);
    return { ok: false, error: "db" };
  }
  return { ok: true };
}

/** Carrega a entrevista mais recente do candidato (a vigente). */
export async function carregarEntrevista(candidatoId: string): Promise<Entrevista | null> {
  const profile = await getCurrentProfile();
  if (!profile) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("entrevistas")
    .select("*")
    .eq("candidato_id", candidatoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as Entrevista | null;
}
