"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { alternarUnidadeAtiva } from "./actions";

export function UnidadeAtivaButton({ id, nome, ativa }: { id: string; nome: string; ativa: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const alternar = () => {
    startTransition(async () => {
      const r = await alternarUnidadeAtiva(id, !ativa);
      if (r.ok) {
        toast.success(ativa ? `${nome} desativada.` : `${nome} reativada.`);
        router.refresh();
      } else {
        toast.error("Erro ao alterar a unidade.");
      }
    });
  };

  return (
    <Button size="sm" variant="ghost" onClick={alternar} disabled={pending}>
      {ativa ? "Desativar" : "Reativar"}
    </Button>
  );
}
