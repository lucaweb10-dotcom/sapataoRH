import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { UnidadeDialog } from "./unidade-dialog";
import { UnidadeAtivaButton } from "./unidade-ativa-button";
import type { Unidade } from "@/types/database";

export const dynamic = "force-dynamic";

export type UnidadeRow = Pick<Unidade, "id" | "nome" | "cidade" | "endereco" | "ativa"> & {
  temFunil: boolean;
};

export default async function UnidadesConfigPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data: unidadesRows }, { data: funisRows }] = await Promise.all([
    supabase
      .from("unidades")
      .select("id, nome, cidade, endereco, ativa")
      .eq("empresa_id", profile.empresa_id)
      .order("nome"),
    supabase.from("funis").select("unidade_id").eq("empresa_id", profile.empresa_id).eq("ativo", true),
  ]);
  const comFunil = new Set((funisRows ?? []).map((f) => f.unidade_id).filter(Boolean));
  const unidades: UnidadeRow[] = (
    (unidadesRows ?? []) as Pick<Unidade, "id" | "nome" | "cidade" | "endereco" | "ativa">[]
  ).map((u) => ({ ...u, temFunil: comFunil.has(u.id) }));

  return (
    <PageContainer>
      <SettingsNav />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Unidades</h1>
          <p className="text-sm text-neutro-700">
            Os postos/lojas da empresa. Cada unidade pode ter o próprio funil (criado em
            Configurações &gt; Funil) e aparece nos filtros do Kanban, candidatos e funcionários.
          </p>
        </div>
        <UnidadeDialog />
      </div>

      <div className="mt-6 rounded-lg border border-neutro-200 bg-white">
        {unidades.length === 0 ? (
          <p className="p-6 text-sm text-neutro-600">Nenhuma unidade cadastrada ainda.</p>
        ) : (
          <ul className="divide-y divide-neutro-100">
            {unidades.map((u) => (
              <li key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm font-medium ${u.ativa ? "text-neutro-900" : "text-neutro-500 line-through"}`}
                  >
                    {u.nome}
                    {u.temFunil && (
                      <span className="ml-2 rounded-full border border-sapatao-verde/30 bg-sapatao-verde/10 px-2 py-0.5 text-[11px] font-medium text-sapatao-verde">
                        funil próprio
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-neutro-500">
                    {[u.endereco, u.cidade].filter(Boolean).join(" · ") || "Sem endereço cadastrado"}
                  </p>
                </div>
                <UnidadeDialog unidade={u} />
                <UnidadeAtivaButton id={u.id} nome={u.nome} ativa={u.ativa} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
