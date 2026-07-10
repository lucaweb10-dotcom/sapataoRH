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
