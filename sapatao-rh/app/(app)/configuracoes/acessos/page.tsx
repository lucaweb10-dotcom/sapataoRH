import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Unidade } from "@/types/database";
import { NovoUsuarioForm } from "./novo-usuario-form";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";

export default async function AcessosPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data: usuarios }, { data: unidades }] = await Promise.all([
    supabase.from("profiles").select("*").order("nome"),
    supabase.from("unidades").select("*").order("nome"),
  ]);

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-display text-display font-bold">Acessos</h1>
            <p className="text-sm text-muted-foreground">
              Usuários e níveis de acesso da empresa.
            </p>
          </div>
          <NovoUsuarioForm unidades={(unidades ?? []) as Unidade[]} />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((usuarios ?? []) as Profile[]).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="capitalize">{u.role}</TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "default" : "secondary"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </PageContainer>
  );
}
