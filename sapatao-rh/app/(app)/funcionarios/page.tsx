import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus, UserRoundCheck } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { FuncionariosFiltros } from "@/components/funcionarios/filtros-bar";
import { FuncionariosTabela } from "@/components/funcionarios/tabela";
import { PaginacaoNav } from "@/components/shared/paginacao-nav";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { parseFiltros } from "@/lib/funcionarios/filtros";
import { listFuncionarios, listUnidades } from "@/lib/funcionarios/queries";
import { totalPaginas, resumoPaginacao } from "@/lib/shared/paginacao";

export const dynamic = "force-dynamic";

export default async function FuncionariosPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const filtros = parseFiltros(sp);
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  const [{ rows, total }, unidades] = await Promise.all([
    listFuncionarios(filtros),
    listUnidades(),
  ]);
  const unidadesById: Record<string, string> = {};
  for (const u of unidades) unidadesById[u.id] = u.nome;

  // O export respeita os filtros atuais da URL.
  const exportQs = new URLSearchParams();
  if (filtros.q) exportQs.set("q", filtros.q);
  exportQs.set("status", filtros.status ?? "todos");
  if (filtros.unidadeId) exportQs.set("unidade", filtros.unidadeId);

  const temFiltroExplicito =
    filtros.q !== "" || sp.status !== undefined || filtros.unidadeId !== null;

  return (
    <PageContainer>
      <PageHeader
        title="Funcionários"
        description="Base mestre de pessoal — cadastre direto ou promova candidatos contratados."
        actions={
          <>
            <Button
              variant="outline"
              size="sm"
              render={<a href={`/api/funcionarios/export?${exportQs}`} />}
            >
              <Download />
              Exportar CSV
            </Button>
            {canEdit && (
              <Button size="sm" render={<Link href="/funcionarios/novo" />}>
                <Plus />
                Novo funcionário
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-4">
        <FuncionariosFiltros unidades={unidades} />

        {rows.length === 0 ? (
          temFiltroExplicito ? (
            <EmptyState
              icon={<UserRoundCheck />}
              title="Nenhum funcionário encontrado"
              description="Nenhum resultado para os filtros aplicados."
              action={
                <Button size="sm" variant="outline" render={<Link href="/funcionarios" />}>
                  Limpar filtros
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={<UserRoundCheck />}
              title="Nenhum funcionário ativo ainda"
              description="Cadastre manualmente ou mova um candidato para “Contratado” no funil e promova-o pela ficha."
              action={
                canEdit ? (
                  <Button size="sm" render={<Link href="/funcionarios/novo" />}>
                    <Plus />
                    Cadastrar primeiro funcionário
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <FuncionariosTabela rows={rows} unidadesById={unidadesById} />
            <PaginacaoNav
              page={filtros.page}
              totalPaginas={totalPaginas(total)}
              resumo={resumoPaginacao(filtros.page, total)}
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}
