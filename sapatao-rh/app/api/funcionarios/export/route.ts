import { NextResponse, type NextRequest } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { parseFiltros } from "@/lib/funcionarios/filtros";
import { listFuncionariosCsv } from "@/lib/funcionarios/queries";
import { gerarCsv } from "@/lib/funcionarios/csv";

export const dynamic = "force-dynamic";

/** CSV dos funcionários respeitando os filtros da URL (q/status/unidade).
 *  Sessão RLS-scoped; admin/rh. BOM UTF-8 para abrir certo no Excel. */
export async function GET(request: NextRequest) {
  const profile = await getCurrentProfile();
  if (!profile) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const canExport = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  if (!canExport) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const filtros = parseFiltros({
    q: sp.get("q") ?? undefined,
    status: sp.get("status") ?? undefined,
    unidade: sp.get("unidade") ?? undefined,
  });

  const rows = await listFuncionariosCsv(filtros);
  const csv = "\uFEFF" + gerarCsv(rows);

  const hoje = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="funcionarios-${hoje}.csv"`,
    },
  });
}
