"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InativarDialog } from "./inativar-dialog";
import { reativarFuncionario } from "@/app/(app)/funcionarios/actions";
import type { FuncionarioStatus } from "@/types/database";

export function FuncionarioAcoes({
  funcionarioId,
  nome,
  status,
  canEdit,
}: {
  funcionarioId: string;
  nome: string;
  status: FuncionarioStatus;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [inativarOpen, setInativarOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!canEdit) return null;

  const onReativar = () => {
    startTransition(async () => {
      const r = await reativarFuncionario(funcionarioId);
      if (r.ok) {
        toast.success("Funcionário reativado.");
        router.refresh();
      } else {
        toast.error("Erro ao reativar.");
      }
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" render={<Link href={`/funcionarios/${funcionarioId}/editar`} />}>
        <Pencil className="size-3.5" />
        Editar
      </Button>

      {status === "inativo" ? (
        <Button size="sm" variant="outline" onClick={onReativar} disabled={pending}>
          Reativar
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          className="text-destructive"
          onClick={() => setInativarOpen(true)}
          disabled={pending}
        >
          Inativar
        </Button>
      )}

      <InativarDialog
        open={inativarOpen}
        onOpenChange={setInativarOpen}
        funcionarioId={funcionarioId}
        nome={nome}
      />
    </div>
  );
}
