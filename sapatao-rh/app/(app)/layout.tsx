import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
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
      <Sidebar role={profile.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar profile={profile} unidades={visiveis} />
        <main className="flex-1 overflow-auto bg-neutro-50 p-6">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
