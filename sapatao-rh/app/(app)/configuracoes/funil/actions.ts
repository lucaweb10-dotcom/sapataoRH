"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { etapaSchema, type EtapaInputDTO } from "@/lib/validations/etapa";
import type { Profile } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

/** Cria uma etapa no fim do funil (ordem = max+1). Carimba a empresa do funil. */
export async function criarEtapa(funilId: string, input: EtapaInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = etapaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { data: funil } = await supabase.from("funis").select("empresa_id").eq("id", funilId).maybeSingle();
  if (!funil) return { ok: false, error: "forbidden" }; // RLS escondeu ou não existe

  const { data: maxRow } = await supabase
    .from("funil_etapas")
    .select("ordem")
    .eq("funil_id", funilId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle();
  const ordem = (maxRow?.ordem ?? 0) + 1;

  const { error } = await supabase.from("funil_etapas").insert({
    empresa_id: funil.empresa_id,
    funil_id: funilId,
    nome: parsed.data.nome,
    cor: parsed.data.cor,
    ordem,
    sla_dias: parsed.data.sla_dias,
    is_terminal: parsed.data.is_terminal,
    requires_confirm: parsed.data.requires_confirm,
    status_destino: parsed.data.status_destino,
  });
  if (error) {
    console.error("[funil/config] criarEtapa:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/funil");
  return { ok: true };
}

/** Atualiza os campos editáveis de uma etapa (não toca em marcador/ordem). */
export async function atualizarEtapa(etapaId: string, input: EtapaInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = etapaSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("funil_etapas")
    .update({
      nome: parsed.data.nome,
      cor: parsed.data.cor,
      sla_dias: parsed.data.sla_dias,
      is_terminal: parsed.data.is_terminal,
      requires_confirm: parsed.data.requires_confirm,
      status_destino: parsed.data.status_destino,
    })
    .eq("id", etapaId);
  if (error) {
    console.error("[funil/config] atualizarEtapa:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/funil");
  return { ok: true };
}

/** Regrava ordem 1..N atomicamente via RPC. Valida que os ids são exatamente as etapas do funil. */
export async function reordenarEtapas(funilId: string, idsOrdenados: string[]): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data: etapas } = await supabase.from("funil_etapas").select("id").eq("funil_id", funilId);
  const validos = new Set((etapas ?? []).map((e) => e.id));
  if (idsOrdenados.length !== validos.size || !idsOrdenados.every((id) => validos.has(id))) {
    return { ok: false, error: "invalido" };
  }
  // RPC executa todos os UPDATEs numa única transação implícita (sem corrupção parcial).
  // Cast necessário: supabase-js não infere RPCs customizados quando Functions=Record<string,never>.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("reorder_funil_etapas", {
    p_funil_id: funilId,
    p_ids: idsOrdenados,
  });
  if (error) {
    console.error("[funil/config] reordenarEtapas:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/funil");
  return { ok: true };
}

/** Exclui uma etapa — bloqueado se houver candidatos nela ou se for etapa do sistema (marcador). */
export async function excluirEtapa(etapaId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();

  // Verifica marcador ANTES de contar candidatos para dar mensagem clara
  const { data: etapa } = await supabase.from("funil_etapas").select("marcador").eq("id", etapaId).maybeSingle();
  if (!etapa) return { ok: false, error: "forbidden" }; // RLS escondeu ou não existe
  if (etapa.marcador) return { ok: false, error: "etapa_sistema" };

  const { count } = await supabase
    .from("candidatos")
    .select("id", { count: "exact", head: true })
    .eq("etapa_id", etapaId);
  if ((count ?? 0) > 0) return { ok: false, error: "etapa_ocupada" };

  const { error } = await supabase.from("funil_etapas").delete().eq("id", etapaId);
  if (error) {
    console.error("[funil/config] excluirEtapa:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/funil");
  return { ok: true };
}
