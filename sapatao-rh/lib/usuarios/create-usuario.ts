import type { CreateUsuarioInput } from "@/lib/validations/usuarios";
import type { Role } from "@/types/database";

export interface AdminLike {
  auth: {
    admin: {
      createUser: (args: {
        email: string;
        password: string;
        email_confirm: boolean;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
  };
}

export interface ActorContext {
  empresa_id: string;
  ator_id: string;
  role: Role;
  platform_admin: boolean;
}

export type CreateUsuarioResult = {
  ok: boolean;
  userId?: string;
  error?: "forbidden" | "email_exists" | "auth_failed" | "profile_failed";
};

export async function createUsuario(
  input: CreateUsuarioInput,
  actor: ActorContext,
  admin: AdminLike,
): Promise<CreateUsuarioResult> {
  if (actor.role !== "admin" && !actor.platform_admin) {
    return { ok: false, error: "forbidden" };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.senha,
    email_confirm: true,
  });

  if (error || !data.user) {
    const dup = error?.message?.toLowerCase().includes("already");
    return { ok: false, error: dup ? "email_exists" : "auth_failed" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    empresa_id: actor.empresa_id,
    nome: input.nome,
    email: input.email,
    role: input.role,
    platform_admin: false,
    unidades_acesso: input.unidades_acesso,
    ativo: true,
  });

  if (profileError) return { ok: false, error: "profile_failed" };

  await admin.from("audit_log").insert({
    empresa_id: actor.empresa_id,
    ator_id: actor.ator_id,
    acao: "usuario.criado",
    entidade: "profiles",
    entidade_id: data.user.id,
    payload: { role: input.role, email: input.email },
  });

  return { ok: true, userId: data.user.id };
}
