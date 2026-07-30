import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { FuncionarioForm } from "@/components/funcionarios/form";
import type { FormValores } from "@/lib/funcionarios/form-valores";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFuncionario, listUnidades } from "@/lib/funcionarios/queries";
import { formatarCpf } from "@/lib/funcionarios/cpf";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditarFuncionarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  if (!canEdit) redirect(`/funcionarios/${id}`);

  const [funcionario, unidades] = await Promise.all([getFuncionario(id), listUnidades()]);
  if (!funcionario) notFound();

  const defaults: FormValores = {
    nome_completo: funcionario.nome_completo,
    cpf: formatarCpf(funcionario.cpf),
    rg: funcionario.rg ?? "",
    data_nascimento: funcionario.data_nascimento ?? "",
    telefone: funcionario.telefone ?? "",
    email: funcionario.email ?? "",
    cep: funcionario.cep ?? "",
    endereco: funcionario.endereco ?? "",
    cargo: funcionario.cargo,
    unidade_id: funcionario.unidade_id ?? "",
    data_admissao: funcionario.data_admissao,
    salario: funcionario.salario === null ? "" : String(funcionario.salario).replace(".", ","),
    jornada: funcionario.jornada ?? "",
  };

  return (
    <PageContainer>
      <Link
        href={`/funcionarios/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        {funcionario.nome_completo}
      </Link>

      <div className="mt-4 space-y-1">
        <h1 className="font-display text-display font-bold">Editar funcionário</h1>
      </div>

      <div className="mt-6 max-w-3xl">
        <FuncionarioForm unidades={unidades} defaults={defaults} funcionarioId={id} />
      </div>
    </PageContainer>
  );
}
