import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { FuncionarioForm } from "@/components/funcionarios/form";
import { FORM_VAZIO, type FormValores } from "@/lib/funcionarios/form-valores";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { listUnidades, getFuncionarioDoCandidato } from "@/lib/funcionarios/queries";
import { createClient } from "@/lib/supabase/server";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function NovoFuncionarioPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  if (!canEdit) redirect("/funcionarios");

  const sp = await searchParams;
  const candidatoId =
    typeof sp.candidato === "string" && UUID_RE.test(sp.candidato) ? sp.candidato : null;

  // Promoção: pré-preenche a partir do candidato (PRD 9.5).
  let defaults: FormValores = FORM_VAZIO;
  let candidatoNome: string | null = null;
  if (candidatoId) {
    // Se já foi promovido, vai direto para a ficha existente.
    const existente = await getFuncionarioDoCandidato(candidatoId);
    if (existente) redirect(`/funcionarios/${existente.id}`);

    const supabase = await createClient();
    const { data } = await supabase
      .from("candidatos")
      .select("nome, telefone, cep, endereco, vaga_interesse, unidade_id")
      .eq("id", candidatoId)
      .maybeSingle<
        Pick<Candidato, "nome" | "telefone" | "cep" | "endereco" | "vaga_interesse" | "unidade_id">
      >();
    if (data) {
      candidatoNome = data.nome;
      defaults = {
        ...FORM_VAZIO,
        nome_completo: data.nome ?? "",
        telefone: data.telefone ?? "",
        cep: data.cep ?? "",
        endereco: data.endereco ?? "",
        cargo: data.vaga_interesse ?? "",
        unidade_id: data.unidade_id ?? "",
      };
    }
  }

  const unidades = await listUnidades();

  return (
    <PageContainer>
      <Link
        href={candidatoId ? `/candidatos/${candidatoId}` : "/funcionarios"}
        className="inline-flex items-center gap-1.5 text-sm text-neutro-700 hover:text-neutro-900"
      >
        <ArrowLeft className="size-4" />
        {candidatoId ? "Ficha do candidato" : "Funcionários"}
      </Link>

      <div className="mt-4 space-y-1">
        <h1 className="font-display text-2xl font-bold">Novo funcionário</h1>
        {candidatoNome ? (
          <p className="text-sm text-neutro-700">
            Promovendo o candidato <span className="font-medium">{candidatoNome}</span> — confira
            os dados e complete o que falta.
          </p>
        ) : (
          <p className="text-sm text-neutro-700">Cadastro manual de funcionário.</p>
        )}
      </div>

      <div className="mt-6 max-w-3xl">
        <FuncionarioForm
          unidades={unidades}
          defaults={defaults}
          candidatoOrigemId={candidatoId ?? undefined}
        />
      </div>
    </PageContainer>
  );
}
