"use client";

// Select de unidade do candidato (SP7): trocar a unidade MIGRA o card para a
// etapa equivalente do funil da nova unidade (action definirUnidade).
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { definirUnidade } from "@/app/(app)/candidatos/actions";

const SEM_UNIDADE = "__sem__";

export interface UnidadeOpcao {
  id: string;
  nome: string;
}

interface Props {
  candidatoId: string;
  unidadeAtualId: string | null;
  unidades: UnidadeOpcao[];
  canEdit: boolean;
}

export function UnidadeSelect({ candidatoId, unidadeAtualId, unidades, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (unidades.length === 0) return null;

  // Unidade atual pode estar INATIVA (fora da lista) — nunca mostrar UUID cru.
  const atualForaDaLista = !!unidadeAtualId && !unidades.some((u) => u.id === unidadeAtualId);
  const nomeAtual = atualForaDaLista
    ? "Unidade inativa"
    : (unidades.find((u) => u.id === unidadeAtualId)?.nome ?? "Sem unidade");

  if (!canEdit) {
    return (
      <div>
        <p className="mb-1.5 text-caption font-medium text-muted-foreground">Unidade</p>
        <p className="text-sm text-foreground">{nomeAtual}</p>
      </div>
    );
  }

  const onChange = (v: string | null) => {
    const novaId = v === SEM_UNIDADE || v === null ? null : v;
    if (novaId === unidadeAtualId) return;
    startTransition(async () => {
      const r = await definirUnidade(candidatoId, novaId);
      if (r.ok) {
        toast.success(
          r.migrou ? "Unidade atualizada — card migrado para o funil da unidade." : "Unidade atualizada.",
        );
        router.refresh();
      } else {
        toast.error("Não foi possível alterar a unidade.");
      }
    });
  };

  return (
    <div>
      <p className="mb-1.5 text-caption font-medium text-muted-foreground">Unidade</p>
      <Select
        value={unidadeAtualId ?? SEM_UNIDADE}
        onValueChange={onChange}
        items={{
          [SEM_UNIDADE]: "Sem unidade",
          ...(atualForaDaLista && unidadeAtualId ? { [unidadeAtualId]: "Unidade inativa" } : {}),
          ...Object.fromEntries(unidades.map((u) => [u.id, u.nome])),
        }}
      >
        <SelectTrigger size="sm" className="w-full" disabled={pending} aria-label="Unidade do candidato">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SEM_UNIDADE}>Sem unidade</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
