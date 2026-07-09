import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Plus, UserRoundCheck } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Funcionários</h1>
          <p className="text-sm text-neutro-700">
            Base mestre de pessoal — cadastre direto ou promova candidatos contratados.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            render={<a href={`/api/funcionarios/export?${exportQs}`} />}
          >
            <Download className="size-3.5" />
            Exportar CSV
          </Button>
          {canEdit && (
            <Button size="sm" render={<Link href="/funcionarios/novo" />}>
              <Plus className="size-3.5" />
              Novo funcionário
            </Button>
          )}
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <FuncionariosFiltros unidades={unidades} />

        {rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-neutro-200 bg-card px-6 py-14 text-center">
            <UserRoundCheck className="size-8 text-neutro-400" />
            {temFiltroExplicito ? (
              <>
                <p className="text-sm text-neutro-700">
                  Nenhum funcionário encontrado com esses filtros.
                </p>
                <Button size="sm" variant="outline" render={<Link href="/funcionarios" />}>
                  Limpar filtros
                </Button>
              </>
            ) : (
              <>
                <p className="max-w-sm text-sm text-neutro-700">
                  Nenhum funcionário ativo ainda. Cadastre manualmente ou mova um candidato para
                  “Contratado” no funil e promova-o pela ficha.
                </p>
                {canEdit && (
                  <Button size="sm" render={<Link href="/funcionarios/novo" />}>
                    <Plus className="size-3.5" />
                    Cadastrar primeiro funcionário
                  </Button>
                )}
              </>
            )}
          </div>
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
