"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { templateSchema, type TemplateInputDTO } from "@/lib/validations/template";
import type { Profile } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

/** Cria um template de mensagem (admin). */
export async function criarTemplate(input: TemplateInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").insert({
    empresa_id: profile.empresa_id,
    nome: parsed.data.nome,
    categoria: parsed.data.categoria,
    conteudo: parsed.data.conteudo,
    ativo: parsed.data.ativo,
  });
  if (error) {
    console.error("[config/templates] criarTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}

/** Atualiza nome/categoria/conteúdo/ativo de um template (admin). */
export async function atualizarTemplate(
  templateId: string,
  input: TemplateInputDTO,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_templates")
    .update({
      nome: parsed.data.nome,
      categoria: parsed.data.categoria,
      conteudo: parsed.data.conteudo,
      ativo: parsed.data.ativo,
    })
    .eq("id", templateId);
  if (error) {
    console.error("[config/templates] atualizarTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}

/** Exclui um template (admin). */
export async function excluirTemplate(templateId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").delete().eq("id", templateId);
  if (error) {
    console.error("[config/templates] excluirTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}
