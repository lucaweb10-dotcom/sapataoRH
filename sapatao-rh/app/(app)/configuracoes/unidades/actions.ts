"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { unidadeSchema, type UnidadeInputDTO } from "@/lib/validations/unidade";
import type { Profile } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

function revalidar() {
  revalidatePath("/configuracoes/unidades");
  revalidatePath("/configuracoes/funil");
  revalidatePath("/funil");
}

export async function criarUnidade(input: UnidadeInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = unidadeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase.from("unidades").insert({
    empresa_id: profile.empresa_id,
    nome: parsed.data.nome,
    cidade: parsed.data.cidade,
    endereco: parsed.data.endereco,
    ativa: true,
  });
  if (error) {
    console.error("[config/unidades] criarUnidade:", error);
    return { ok: false, error: "db" };
  }
  revalidar();
  return { ok: true };
}

export async function atualizarUnidade(id: string, input: UnidadeInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = unidadeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  // Defense-in-depth: carimba o tenant + detecta 0 linhas (RLS silenciosa).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update({ nome: parsed.data.nome, cidade: parsed.data.cidade, endereco: parsed.data.endereco })
    .eq("id", id)
    .eq("empresa_id", profile.empresa_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[config/unidades] atualizarUnidade:", error);
    return { ok: false, error: "db" };
  }
  if (!data) return { ok: false, error: "not_found" };
  revalidar();
  return { ok: true };
}

/** Desativar tira a unidade dos seletores (candidatos/funcionários mantêm o vínculo). */
export async function alternarUnidadeAtiva(id: string, ativa: boolean): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("unidades")
    .update({ ativa })
    .eq("id", id)
    .eq("empresa_id", profile.empresa_id)
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("[config/unidades] alternarUnidadeAtiva:", error);
    return { ok: false, error: "db" };
  }
  if (!data) return { ok: false, error: "not_found" };
  revalidar();
  return { ok: true };
}
