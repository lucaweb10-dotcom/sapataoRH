import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUsuarioSchema } from "@/lib/validations/usuarios";
import { createUsuario, type AdminLike } from "@/lib/usuarios/create-usuario";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid", issues: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const admin = createAdminClient() as unknown as AdminLike;
  const result = await createUsuario(
    parsed.data,
    {
      empresa_id: profile.empresa_id,
      ator_id: profile.id,
      role: profile.role,
      platform_admin: profile.platform_admin,
    },
    admin,
  );

  if (!result.ok) {
    const status =
      result.error === "forbidden"
        ? 403
        : result.error === "email_exists"
          ? 409
          : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, userId: result.userId }, { status: 201 });
}
