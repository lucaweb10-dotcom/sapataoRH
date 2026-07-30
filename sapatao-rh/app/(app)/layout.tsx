import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessPath } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { NotificacoesProvider } from "@/components/shell/notificacoes-provider";
import { Toaster } from "@/components/ui/sonner";
import type { Unidade } from "@/types/database";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.ativo) redirect("/login");

  // Server-side route guard (defense in depth beyond nav filtering).
  const pathname = (await headers()).get("x-pathname") ?? "";
  if (pathname && !canAccessPath(profile.role, pathname)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data: unidades }, { data: conversas }] = await Promise.all([
    supabase.from("unidades").select("*").order("nome"),
    // Soma inicial de não-lidas para o badge (RLS: papéis sem acesso a
    // conversations recebem [] e o badge simplesmente não aparece).
    supabase.from("conversations").select("id, unread_count"),
  ]);

  const visiveis = ((unidades ?? []) as Unidade[]).filter(
    (u: Unidade) =>
      profile.platform_admin || profile.unidades_acesso.includes(u.id),
  );

  return (
    <NotificacoesProvider
      empresaId={profile.empresa_id}
      conversasIniciais={
        (conversas ?? []) as { id: string; unread_count: number }[]
      }
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={profile.role} profile={profile} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Suspense
            fallback={<div className="h-14 shrink-0 border-b border-border bg-card" />}
          >
            <Topbar profile={profile} unidades={visiveis} />
          </Suspense>
          <main className="flex-1 overflow-hidden bg-muted">{children}</main>
        </div>
        <Toaster />
      </div>
    </NotificacoesProvider>
  );
}
