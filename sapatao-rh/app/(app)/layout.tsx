import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { canAccessPath } from "@/lib/auth/rbac";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
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
  const { data: unidades } = await supabase
    .from("unidades")
    .select("*")
    .order("nome");

  const visiveis = ((unidades ?? []) as Unidade[]).filter(
    (u: Unidade) =>
      profile.platform_admin || profile.unidades_acesso.includes(u.id),
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={profile.role} profile={profile} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar profile={profile} unidades={visiveis} />
        <main className="flex-1 overflow-hidden bg-neutro-50">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
