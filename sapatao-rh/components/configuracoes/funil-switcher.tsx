"use client";

// SP7: seletor do funil em edição (?f=) + criar funil por unidade (clona o
// template/Geral) + excluir funil de unidade vazio.
import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarFunilDaUnidade, excluirFunil } from "@/app/(app)/configuracoes/funil/actions";
import type { FunilResumo } from "@/lib/funil/queries";

interface Props {
  funis: FunilResumo[];
  funilSelecionadoId: string;
  /** Unidades ativas SEM funil próprio (candidatas a novo funil). */
  unidadesSemFunil: { id: string; nome: string }[];
}

function labelDoFunil(f: FunilResumo): string {
  if (f.is_default) return `${f.nome} (Geral — template)`;
  return f.unidadeNome ? `${f.nome} — ${f.unidadeNome}` : f.nome;
}

export function FunilSwitcher({ funis, funilSelecionadoId, unidadesSemFunil }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [novaUnidadeId, setNovaUnidadeId] = useState<string | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState(false);

  const selecionado = funis.find((f) => f.id === funilSelecionadoId) ?? null;

  const irPara = (funilId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (funilId) params.set("f", funilId);
    else params.delete("f");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const criar = () => {
    if (!novaUnidadeId) return;
    startTransition(async () => {
      const r = await criarFunilDaUnidade(novaUnidadeId);
      if (r.ok) {
        toast.success(
          r.migrados > 0
            ? `Funil criado a partir do template — ${r.migrados} candidato(s) da unidade migrados para ele.`
            : "Funil criado a partir do template — ajuste as etapas como quiser.",
        );
        setNovaUnidadeId(null);
        irPara(r.funilId);
        router.refresh();
      } else {
        toast.error(
          r.error === "funil_existente"
            ? "Esta unidade já tem um funil."
            : r.error === "sem_template"
              ? "O funil Geral (template) não foi encontrado."
              : "Erro ao criar o funil.",
        );
      }
    });
  };

  const excluir = () => {
    if (!selecionado || selecionado.is_default) return;
    startTransition(async () => {
      const r = await excluirFunil(selecionado.id);
      setConfirmandoExclusao(false);
      if (r.ok) {
        toast.success("Funil excluído.");
        irPara(null);
        router.refresh();
      } else {
        toast.error(
          r.error === "tem_candidatos"
            ? "Este funil tem candidatos nas etapas — mova-os antes de excluir."
            : r.error === "funil_geral"
              ? "O funil Geral não pode ser excluído (é o template da empresa)."
              : "Erro ao excluir o funil.",
        );
      }
    });
  };

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-neutro-200 bg-white p-4">
      <div className="space-y-1">
        <span className="text-xs font-medium text-neutro-700">Funil em edição</span>
        <Select
          value={funilSelecionadoId}
          onValueChange={(v: string | null) => irPara(v)}
          items={Object.fromEntries(funis.map((f) => [f.id, labelDoFunil(f)]))}
        >
          <SelectTrigger size="sm" className="min-w-64" aria-label="Funil em edição">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {funis.map((f) => (
              <SelectItem key={f.id} value={f.id}>
                {labelDoFunil(f)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {unidadesSemFunil.length > 0 && (
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <span className="text-xs font-medium text-neutro-700">Nova unidade com funil próprio</span>
            <Select
              value={novaUnidadeId}
              onValueChange={(v: string | null) => setNovaUnidadeId(v)}
              items={Object.fromEntries(unidadesSemFunil.map((u) => [u.id, u.nome]))}
            >
              <SelectTrigger size="sm" className="min-w-48" aria-label="Unidade do novo funil">
                <SelectValue placeholder="Escolha a unidade" />
              </SelectTrigger>
              <SelectContent>
                {unidadesSemFunil.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={criar} disabled={pending || !novaUnidadeId}>
            <Plus className="size-4" />
            Criar funil (clona o template)
          </Button>
        </div>
      )}

      {selecionado && !selecionado.is_default && (
        <div className="ml-auto flex items-center gap-2">
          {confirmandoExclusao ? (
            <>
              <span className="text-xs text-neutro-600">Excluir este funil?</span>
              <Button size="sm" variant="destructive" onClick={excluir} disabled={pending}>
                Sim, excluir
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirmandoExclusao(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setConfirmandoExclusao(true)}
              disabled={pending}
            >
              <Trash2 className="size-4" />
              Excluir funil
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
