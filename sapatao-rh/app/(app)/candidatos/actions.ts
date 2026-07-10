"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import {
  criarCandidatoSchema,
  atualizarCandidatoSchema,
  type CriarCandidatoInput,
  type AtualizarCandidatoInput,
} from "@/lib/validations/candidatos";
import { buscaOr } from "@/lib/candidatos/filtros";
import {
  mapearEtapaEquivalente,
  statusAposMigracao,
  type EtapaMapeavel,
} from "@/lib/funil/migrar-unidade";
import type { Candidato, Funil } from "@/types/database";

function canWrite(role: string, platformAdmin: boolean): boolean {
  return platformAdmin || role === "admin" || role === "rh";
}

export type Responsavel = { id: string; nome: string };
export type CandidatoBusca = { id: string; nome: string; telefone: string };
export type AtualizarPatch = AtualizarCandidatoInput;

/** Cria um candidato manual (indicação/presencial/etc). O trigger BEFORE INSERT
 *  da 0010 posiciona na 1ª etapa do funil padrão. Telefone duplicado (unique
 *  empresa_id+telefone, 23505) devolve o id existente para a UI oferecer "abrir ficha". */
export async function criarCandidato(
  input: CriarCandidatoInput,
): Promise<{ ok: true; candidatoId: string } | { ok?: false; error: string; candidatoId?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const parsed = criarCandidatoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidatos")
    .insert({
      empresa_id: profile.empresa_id,
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      vaga_interesse: parsed.data.vaga_interesse,
      unidade_id: parsed.data.unidade_id,
      origem: parsed.data.origem,
      tags: parsed.data.tags,
      status: "ativo",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // RLS já escopa por empresa; buscamos o dono do telefone para o link "abrir ficha".
    const { data: existente } = await supabase
      .from("candidatos")
      .select("id")
      .eq("telefone", parsed.data.telefone)
      .maybeSingle();
    return { error: "telefone_existente", candidatoId: existente?.id };
  }
  if (error || !data) {
    console.error("[candidatos/actions] criarCandidato:", error);
    return { error: "db" };
  }

  revalidatePath("/candidatos");
  revalidatePath("/funil");
  return { ok: true, candidatoId: data.id };
}

/** Atualiza dados do candidato. Telefone SÓ pode mudar enquanto o candidato não
 *  tem conversa (é a identidade do WhatsApp) — checagem server-side, não só na UI. */
export async function atualizarCandidato(
  candidatoId: string,
  patch: AtualizarCandidatoInput,
): Promise<{ ok: true } | { ok?: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const parsed = atualizarCandidatoSchema.safeParse(patch);
  if (!parsed.success) return { error: "invalido" };

  const supabase = await createClient();

  if (parsed.data.telefone !== undefined) {
    const { data: conversa } = await supabase
      .from("conversations")
      .select("id")
      .eq("candidato_id", candidatoId)
      .maybeSingle();
    if (conversa) return { error: "telefone_bloqueado" };
  }

  const { error } = await supabase.from("candidatos").update(parsed.data).eq("id", candidatoId);
  if (error?.code === "23505") return { error: "telefone_existente" };
  if (error) {
    console.error("[candidatos/actions] atualizarCandidato:", error);
    return { error: "db" };
  }

  revalidatePath("/candidatos");
  revalidatePath(`/candidatos/${candidatoId}`);
  revalidatePath("/funil");
  revalidatePath("/chat");
  return { ok: true };
}

/** Cria a conversa do candidato SEM enviar mensagem (o envio é o fluxo normal do
 *  composer). Corrida/23505 devolve a conversa existente. instance_id fica null:
 *  o envio resolve o token da UAZAPI pela empresa (send/route.ts loadContext). */
export async function iniciarConversa(
  candidatoId: string,
): Promise<{ ok: true; conversationId: string } | { ok?: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const supabase = await createClient();

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("id")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!candidato) return { error: "not_found" };

  const { data: existente } = await supabase
    .from("conversations")
    .select("id")
    .eq("candidato_id", candidatoId)
    .maybeSingle();
  if (existente) return { ok: true, conversationId: existente.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      empresa_id: profile.empresa_id,
      candidato_id: candidatoId,
      status: "aberta",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: corrida } = await supabase
      .from("conversations")
      .select("id")
      .eq("candidato_id", candidatoId)
      .maybeSingle();
    if (corrida) return { ok: true, conversationId: corrida.id };
  }
  if (error || !data) {
    console.error("[candidatos/actions] iniciarConversa:", error);
    return { error: "db" };
  }

  revalidatePath("/chat");
  return { ok: true, conversationId: data.id };
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Define/troca a unidade do candidato e MIGRA o card para a etapa equivalente
 *  do funil da nova unidade (SP7 — decisão do usuário: marcador > nome > posição).
 *  unidadeId null = sem unidade → funil Geral. Auditoria em kanban_history. */
export async function definirUnidade(
  candidatoId: string,
  unidadeId: string | null,
): Promise<{ ok: true; migrou: boolean } | { ok?: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };
  if (!UUID_RE.test(candidatoId) || (unidadeId !== null && !UUID_RE.test(unidadeId)))
    return { error: "invalido" };

  const supabase = await createClient();
  const { data: cand } = await supabase
    .from("candidatos")
    .select("id, empresa_id, etapa_id, unidade_id")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!cand) return { error: "not_found" };
  if (cand.unidade_id === unidadeId) return { ok: true, migrou: false };

  // Unidade precisa ser da empresa do candidato (RLS já escopa; defense-in-depth).
  if (unidadeId) {
    const { data: uni } = await supabase
      .from("unidades")
      .select("id")
      .eq("id", unidadeId)
      .eq("empresa_id", cand.empresa_id)
      .maybeSingle();
    if (!uni) return { error: "not_found" };
  }

  // Funil de destino: da nova unidade (se tiver um próprio ativo) ou o Geral.
  let destino: Funil | null = null;
  if (unidadeId) {
    const { data } = await supabase
      .from("funis")
      .select("*")
      .eq("empresa_id", cand.empresa_id)
      .eq("unidade_id", unidadeId)
      .eq("ativo", true)
      .maybeSingle<Funil>();
    destino = data;
  }
  if (!destino) {
    const { data } = await supabase
      .from("funis")
      .select("*")
      .eq("empresa_id", cand.empresa_id)
      .eq("is_default", true)
      .maybeSingle<Funil>();
    destino = data;
  }

  // Funil de origem = o dono da etapa atual do candidato.
  let funilOrigemId: string | null = null;
  if (cand.etapa_id) {
    const { data: etapaAtual } = await supabase
      .from("funil_etapas")
      .select("funil_id")
      .eq("id", cand.etapa_id)
      .maybeSingle();
    funilOrigemId = etapaAtual?.funil_id ?? null;
  }

  // Mesmo funil (ou sem funil de destino) → só troca o rótulo da unidade.
  if (!destino || destino.id === funilOrigemId) {
    const { data, error } = await supabase
      .from("candidatos")
      .update({ unidade_id: unidadeId })
      .eq("id", candidatoId)
      .eq("empresa_id", cand.empresa_id)
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[candidatos/actions] definirUnidade:", error);
      return { error: "db" };
    }
    if (!data) return { error: "not_found" };
    revalidar(candidatoId);
    return { ok: true, migrou: false };
  }

  const CAMPOS_ETAPA = "id, nome, ordem, marcador, is_terminal, status_destino";
  const [{ data: etapasOrigem }, { data: etapasDestino }, { data: unidadeNomeRow }] =
    await Promise.all([
      funilOrigemId
        ? supabase.from("funil_etapas").select(CAMPOS_ETAPA).eq("funil_id", funilOrigemId)
        : Promise.resolve({ data: [] as EtapaMapeavel[] }),
      supabase.from("funil_etapas").select(CAMPOS_ETAPA).eq("funil_id", destino.id),
      unidadeId
        ? supabase.from("unidades").select("nome").eq("id", unidadeId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const destinoEtapas = (etapasDestino ?? []) as EtapaMapeavel[];
  const novaEtapa = mapearEtapaEquivalente(
    cand.etapa_id,
    (etapasOrigem ?? []) as EtapaMapeavel[],
    destinoEtapas,
  );

  const patch: Partial<Candidato> = { unidade_id: unidadeId };
  const migrou = novaEtapa !== null && novaEtapa !== cand.etapa_id;
  if (migrou) {
    patch.etapa_id = novaEtapa;
    patch.etapa_entrou_em = new Date().toISOString();
    // Status é TOTAL (mesma regra do mover): terminal → status_destino; senão ativo.
    const status = statusAposMigracao(destinoEtapas.find((e) => e.id === novaEtapa));
    if (status) patch.status = status as Candidato["status"];
  }
  const { data: updated, error } = await supabase
    .from("candidatos")
    .update(patch)
    .eq("id", candidatoId)
    .eq("empresa_id", cand.empresa_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[candidatos/actions] definirUnidade:", error);
    return { error: "db" };
  }
  if (!updated) return { error: "not_found" };

  if (migrou) {
    const destinoNome = unidadeId
      ? `funil da unidade ${(unidadeNomeRow as { nome: string } | null)?.nome ?? "selecionada"}`
      : "funil Geral";
    const { error: histErr } = await supabase.from("kanban_history").insert({
      empresa_id: cand.empresa_id, // carimba a empresa do candidato (não a do ator)
      candidato_id: candidatoId,
      de_etapa: cand.etapa_id,
      para_etapa: novaEtapa,
      movido_por: profile.id,
      observacao: `Migrado para o ${destinoNome}`,
    });
    if (histErr) console.error("[candidatos/actions] definirUnidade history:", histErr);
  }

  revalidar(candidatoId);
  return { ok: true, migrou };
}

function revalidar(candidatoId: string) {
  revalidatePath("/candidatos");
  revalidatePath(`/candidatos/${candidatoId}`);
  revalidatePath("/funil");
  revalidatePath("/chat");
}

/** Profiles ativos da empresa com papel admin/rh (selects de responsável). */
export async function listarResponsaveis(): Promise<Responsavel[]> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome")
    .in("role", ["admin", "rh"])
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("[candidatos/actions] listarResponsaveis:", error);
    return [];
  }
  return (data ?? []) as Responsavel[];
}

/** Busca candidatos SEM conversa por nome/telefone (dialog "Nova conversa"). */
export async function buscarCandidatosSemConversa(q: string): Promise<CandidatoBusca[]> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return [];
  const termo = q.trim().slice(0, 80);
  if (termo.length < 2) return [];

  const supabase = await createClient();
  let query = supabase
    .from("candidatos")
    .select("id, nome, telefone, conversations(id)")
    .order("updated_at", { ascending: false })
    .limit(20);
  const or = buscaOr(termo);
  if (or) query = query.or(or);

  const { data, error } = await query;
  if (error) {
    console.error("[candidatos/actions] buscarCandidatosSemConversa:", error);
    return [];
  }
  type Row = CandidatoBusca & { conversations: { id: string }[] | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !r.conversations || r.conversations.length === 0)
    .slice(0, 10)
    .map(({ id, nome, telefone }) => ({ id, nome, telefone }));
}
