"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import {
  funcionarioSchema,
  ocorrenciaSchema,
  inativarSchema,
  type FuncionarioInput,
  type OcorrenciaInput,
  type InativarInput,
} from "@/lib/validations/funcionario";

export type ActionResult = { ok: true; id?: string } | { ok: false; error: string };

function canWrite(role: string, platformAdmin: boolean): boolean {
  return platformAdmin || role === "admin" || role === "rh";
}

function revalidar(id?: string) {
  revalidatePath("/funcionarios");
  if (id) revalidatePath(`/funcionarios/${id}`);
}

/** Creates a funcionário (admin/rh). Detecta CPF duplicado na empresa. */
export async function criarFuncionario(input: FuncionarioInput): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = funcionarioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalido" };
  }

  const supabase = await createClient();

  // Se veio de um candidato, valida que ele é da empresa (RLS cobre; explícito).
  if (parsed.data.candidato_origem_id) {
    const { data: cand } = await supabase
      .from("candidatos")
      .select("id")
      .eq("id", parsed.data.candidato_origem_id)
      .maybeSingle();
    if (!cand) return { ok: false, error: "candidato_nao_encontrado" };
  }

  const { data, error } = await supabase
    .from("funcionarios")
    .insert({
      empresa_id: profile.empresa_id,
      ...parsed.data,
      candidato_origem_id: parsed.data.candidato_origem_id ?? null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      const dup = error.message.includes("candidato")
        ? "Este candidato já foi cadastrado como funcionário."
        : "Já existe um funcionário com este CPF.";
      return { ok: false, error: dup };
    }
    console.error("[funcionarios/actions] criarFuncionario:", error);
    return { ok: false, error: "Erro ao salvar." };
  }

  revalidar(data.id);
  return { ok: true, id: data.id };
}

/** Updates an existing funcionário (admin/rh). */
export async function atualizarFuncionario(
  id: string,
  input: FuncionarioInput,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = funcionarioSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalido" };
  }

  const supabase = await createClient();
  // candidato_origem_id não é editável pelo formulário de edição.
  const patch = { ...parsed.data };
  delete patch.candidato_origem_id;
  const { data, error } = await supabase
    .from("funcionarios")
    .update(patch)
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Já existe um funcionário com este CPF." };
    }
    console.error("[funcionarios/actions] atualizarFuncionario:", error);
    return { ok: false, error: "Erro ao salvar." };
  }
  if (!data) return { ok: false, error: "not_found" };

  revalidar(id);
  return { ok: true, id };
}

/** Inativa com motivo: status inativo + data_demissao + ocorrência de desligamento. */
export async function inativarFuncionario(
  id: string,
  input: InativarInput,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = inativarSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalido" };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funcionarios")
    .update({ status: "inativo", data_demissao: parsed.data.data_demissao })
    .eq("id", id)
    .select("id, empresa_id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[funcionarios/actions] inativarFuncionario:", error);
    return { ok: false, error: "Erro ao inativar." };
  }

  const { error: oErr } = await supabase.from("funcionario_ocorrencias").insert({
    empresa_id: data.empresa_id,
    funcionario_id: id,
    tipo: "desligamento",
    data: parsed.data.data_demissao,
    observacao: parsed.data.motivo,
    registrado_por: profile.id,
  });
  if (oErr) console.error("[funcionarios/actions] ocorrência desligamento:", oErr);

  revalidar(id);
  return { ok: true, id };
}

/** Reativa: status ativo + limpa data_demissao. */
export async function reativarFuncionario(id: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("funcionarios")
    .update({ status: "ativo", data_demissao: null })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("[funcionarios/actions] reativarFuncionario:", error);
    return { ok: false, error: "Erro ao reativar." };
  }
  revalidar(id);
  return { ok: true, id };
}

/** Registra uma ocorrência (falta, atestado, advertência, elogio, outro). */
export async function registrarOcorrencia(
  funcionarioId: string,
  input: OcorrenciaInput,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) {
    return { ok: false, error: "forbidden" };
  }
  const parsed = ocorrenciaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "invalido" };
  }

  const supabase = await createClient();
  const { data: func } = await supabase
    .from("funcionarios")
    .select("empresa_id")
    .eq("id", funcionarioId)
    .maybeSingle();
  if (!func) return { ok: false, error: "not_found" };

  const { error } = await supabase.from("funcionario_ocorrencias").insert({
    empresa_id: func.empresa_id,
    funcionario_id: funcionarioId,
    tipo: parsed.data.tipo,
    data: parsed.data.data,
    observacao: parsed.data.observacao,
    registrado_por: profile.id,
  });
  if (error) {
    console.error("[funcionarios/actions] registrarOcorrencia:", error);
    return { ok: false, error: "Erro ao registrar." };
  }

  revalidar(funcionarioId);
  return { ok: true };
}
