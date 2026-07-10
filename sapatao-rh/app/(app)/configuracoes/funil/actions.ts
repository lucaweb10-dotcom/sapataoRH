"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { etapaSchema, type EtapaInputDTO } from "@/lib/validations/etapa";
import {
  mapearEtapaEquivalente,
  statusAposMigracao,
  type EtapaMapeavel,
} from "@/lib/funil/migrar-unidade";
import type { Candidato, Profile } from "@/types/database";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

/** SP7: cria o funil de uma unidade CLONANDO as etapas do funil Geral (template):
 *  nome/cor/ordem/sla/terminal/confirmação/status_destino/MARCADOR — cada funil
 *  carrega seu próprio 'ia_concluida' (unique é por funil). */
export async function criarFunilDaUnidade(
  unidadeId: string,
): Promise<{ ok: true; funilId: string; migrados: number } | { ok: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(unidadeId)) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { data: unidade } = await supabase
    .from("unidades")
    .select("id, nome")
    .eq("id", unidadeId)
    .eq("empresa_id", profile.empresa_id)
    .eq("ativa", true)
    .maybeSingle();
  if (!unidade) return { ok: false, error: "not_found" };

  const { data: template } = await supabase
    .from("funis")
    .select("id, empresa_id")
    .eq("empresa_id", profile.empresa_id)
    .eq("is_default", true)
    .maybeSingle();
  if (!template) return { ok: false, error: "sem_template" };

  const { data: etapasTemplate } = await supabase
    .from("funil_etapas")
    .select("nome, ordem, cor, sla_dias, is_terminal, requires_confirm, status_destino, marcador")
    .eq("funil_id", template.id)
    .order("ordem", { ascending: true });
  if (!etapasTemplate || etapasTemplate.length === 0) return { ok: false, error: "sem_template" };

  const { data: novoFunil, error: funilErr } = await supabase
    .from("funis")
    .insert({
      empresa_id: profile.empresa_id,
      nome: `Funil ${unidade.nome}`,
      unidade_id: unidade.id,
      is_default: false,
    })
    .select("id")
    .single();
  if (funilErr) {
    if (funilErr.code === "23505") return { ok: false, error: "funil_existente" };
    console.error("[funil/config] criarFunilDaUnidade:", funilErr);
    return { ok: false, error: "db" };
  }

  const { error: etapasErr } = await supabase.from("funil_etapas").insert(
    etapasTemplate.map((e) => ({
      empresa_id: profile.empresa_id,
      funil_id: novoFunil.id,
      nome: e.nome,
      ordem: e.ordem,
      cor: e.cor,
      sla_dias: e.sla_dias,
      is_terminal: e.is_terminal,
      requires_confirm: e.requires_confirm,
      status_destino: e.status_destino,
      marcador: e.marcador,
    })),
  );
  if (etapasErr) {
    console.error("[funil/config] criarFunilDaUnidade etapas:", etapasErr);
    // rollback best-effort do funil vazio (etapas com marcador não existem ainda)
    await supabase.from("funis").delete().eq("id", novoFunil.id);
    return { ok: false, error: "db" };
  }

  // BACKFILL (review SP7): candidatos que JÁ eram da unidade estavam no Geral —
  // sem migrá-los, sumiriam da visão ?u= e a IA pararia de auto-mover (o move
  // é conservador com etapa de outro funil). Mesma regra do definirUnidade.
  let migrados = 0;
  const { data: etapasClone } = await supabase
    .from("funil_etapas")
    .select("id, nome, ordem, marcador, is_terminal, status_destino")
    .eq("funil_id", novoFunil.id);
  const clones = (etapasClone ?? []) as EtapaMapeavel[];

  const { data: candsUnidade } = await supabase
    .from("candidatos")
    .select("id, etapa_id")
    .eq("empresa_id", profile.empresa_id)
    .eq("unidade_id", unidade.id)
    .not("etapa_id", "is", null);

  const porEtapaOrigem = new Map<string, string[]>();
  for (const c of candsUnidade ?? []) {
    if (!c.etapa_id || clones.some((e) => e.id === c.etapa_id)) continue;
    const lista = porEtapaOrigem.get(c.etapa_id) ?? [];
    lista.push(c.id);
    porEtapaOrigem.set(c.etapa_id, lista);
  }

  const etapasPorFunil = new Map<string, EtapaMapeavel[]>();
  for (const [etapaOrigemId, candidatoIds] of porEtapaOrigem) {
    const { data: etapaRow } = await supabase
      .from("funil_etapas")
      .select("funil_id")
      .eq("id", etapaOrigemId)
      .maybeSingle();
    if (!etapaRow?.funil_id) continue;
    if (!etapasPorFunil.has(etapaRow.funil_id)) {
      const { data: etapasOrigem } = await supabase
        .from("funil_etapas")
        .select("id, nome, ordem, marcador, is_terminal, status_destino")
        .eq("funil_id", etapaRow.funil_id);
      etapasPorFunil.set(etapaRow.funil_id, (etapasOrigem ?? []) as EtapaMapeavel[]);
    }
    const alvo = mapearEtapaEquivalente(etapaOrigemId, etapasPorFunil.get(etapaRow.funil_id)!, clones);
    if (!alvo || alvo === etapaOrigemId) continue;

    const patch: Partial<Candidato> = { etapa_id: alvo, etapa_entrou_em: new Date().toISOString() };
    const status = statusAposMigracao(clones.find((e) => e.id === alvo));
    if (status) patch.status = status as Candidato["status"];
    const { error: updErr } = await supabase
      .from("candidatos")
      .update(patch)
      .eq("empresa_id", profile.empresa_id)
      .eq("unidade_id", unidade.id)
      .eq("etapa_id", etapaOrigemId);
    if (updErr) {
      console.error("[funil/config] criarFunilDaUnidade backfill:", updErr);
      continue;
    }
    const { error: histErr } = await supabase.from("kanban_history").insert(
      candidatoIds.map((cid) => ({
        empresa_id: profile.empresa_id,
        candidato_id: cid,
        de_etapa: etapaOrigemId,
        para_etapa: alvo,
        movido_por: profile!.id,
        observacao: `Migrado para o funil da unidade ${unidade.nome}`,
      })),
    );
    if (histErr) console.error("[funil/config] criarFunilDaUnidade history:", histErr);
    migrados += candidatoIds.length;
  }

  revalidatePath("/configuracoes/funil");
  revalidatePath("/funil");
  revalidatePath("/candidatos");
  return { ok: true, funilId: novoFunil.id, migrados };
}

/** SP7: exclui um funil de unidade (nunca o Geral) sem NENHUM candidato nas
 *  etapas. Marcadores são limpos antes (o trigger de proteção bloqueia delete
 *  de etapa de sistema — correto p/ etapas avulsas, dispensável ao apagar o
 *  funil inteiro de uma unidade). */
export async function excluirFunil(funilId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(funilId)) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { data: funil } = await supabase
    .from("funis")
    .select("id, is_default, empresa_id")
    .eq("id", funilId)
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();
  if (!funil) return { ok: false, error: "not_found" };
  if (funil.is_default) return { ok: false, error: "funil_geral" };

  // Anti-TOCTOU (review SP7): desativa ANTES de contar — o trigger de colocação
  // e o definirUnidade ignoram funil inativo, então nenhum candidato novo entra
  // na janela entre o count e o delete (viraria órfão com etapa_id null).
  const { error: desativarErr } = await supabase
    .from("funis")
    .update({ ativo: false })
    .eq("id", funilId);
  if (desativarErr) {
    console.error("[funil/config] excluirFunil desativar:", desativarErr);
    return { ok: false, error: "db" };
  }

  const reativar = async () => {
    await supabase.from("funis").update({ ativo: true }).eq("id", funilId);
  };

  const { data: etapas } = await supabase
    .from("funil_etapas")
    .select("id, marcador")
    .eq("funil_id", funilId);
  const etapaIds = (etapas ?? []).map((e) => e.id);
  if (etapaIds.length > 0) {
    const { count } = await supabase
      .from("candidatos")
      .select("id", { count: "exact", head: true })
      .in("etapa_id", etapaIds);
    if ((count ?? 0) > 0) {
      await reativar();
      return { ok: false, error: "tem_candidatos" };
    }

    // Limpa marcadores (trigger protect_system_etapa bloqueia delete de etapa
    // de sistema — correto p/ etapa avulsa, dispensável ao apagar o funil todo).
    const { error: limparErr } = await supabase
      .from("funil_etapas")
      .update({ marcador: null })
      .eq("funil_id", funilId);
    if (limparErr) {
      console.error("[funil/config] excluirFunil limpar marcadores:", limparErr);
      await reativar();
      return { ok: false, error: "db" };
    }
  }

  const { error } = await supabase.from("funis").delete().eq("id", funilId);
  if (error) {
    console.error("[funil/config] excluirFunil:", error);
    // restaura marcadores + reativa (o funil não pode ficar sem 'ia_concluida')
    for (const e of etapas ?? []) {
      if (e.marcador) {
        await supabase.from("funil_etapas").update({ marcador: e.marcador }).eq("id", e.id);
      }
    }
    await reativar();
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/funil");
  revalidatePath("/funil");
  return { ok: true };
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
