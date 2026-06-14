"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarEtapa, atualizarEtapa } from "@/app/(app)/configuracoes/funil/actions";
import type { FunilEtapa } from "@/types/database";

type StatusDestino = "contratado" | "reprovado" | "desistente";

export function EtapaFormDialog({ funilId, etapa }: { funilId: string; etapa?: FunilEtapa }) {
  const router = useRouter();
  const editing = !!etapa;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#4A7C59");
  const [slaDias, setSlaDias] = useState("");
  const [isTerminal, setIsTerminal] = useState(false);
  const [requiresConfirm, setRequiresConfirm] = useState(false);
  const [statusDestino, setStatusDestino] = useState<StatusDestino | null>(null);

  function reset() {
    setNome(etapa?.nome ?? "");
    setCor(etapa?.cor ?? "#4A7C59");
    setSlaDias(etapa?.sla_dias != null ? String(etapa.sla_dias) : "");
    setIsTerminal(etapa?.is_terminal ?? false);
    setRequiresConfirm(etapa?.requires_confirm ?? false);
    setStatusDestino((etapa?.status_destino as StatusDestino | null) ?? null);
  }

  async function submit() {
    setPending(true);
    const payload = {
      nome: nome.trim(),
      cor,
      sla_dias: slaDias.trim() === "" ? null : Number(slaDias),
      is_terminal: isTerminal,
      requires_confirm: requiresConfirm,
      status_destino: isTerminal ? statusDestino : null,
    };
    const res = editing ? await atualizarEtapa(etapa!.id, payload) : await criarEtapa(funilId, payload);
    setPending(false);
    if (res.ok) {
      toast.success(editing ? "Etapa atualizada." : "Etapa criada.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(
        res.error === "invalido"
          ? "Dados inválidos (verifique nome, cor e status terminal)."
          : res.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao salvar a etapa.",
      );
    }
  }

  return (
    <>
      <Button
        size={editing ? "sm" : "default"}
        variant={editing ? "ghost" : "default"}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {editing ? "Editar" : "Nova etapa"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar etapa" : "Nova etapa"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={60} />
            </div>

            <div className="flex items-end gap-3">
              <div>
                <Label className="mb-1">Cor</Label>
                <input
                  type="color"
                  value={cor}
                  onChange={(e) => setCor(e.target.value)}
                  className="h-8 w-14 rounded border border-neutro-200"
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">SLA (dias)</Label>
                <Input
                  type="number"
                  min={0}
                  value={slaDias}
                  onChange={(e) => setSlaDias(e.target.value)}
                  placeholder="— sem SLA"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-neutro-900">
              <input
                type="checkbox"
                checked={requiresConfirm}
                onChange={(e) => setRequiresConfirm(e.target.checked)}
              />
              Exigir confirmação ao mover para esta etapa
            </label>

            <label className="flex items-center gap-2 text-sm text-neutro-900">
              <input
                type="checkbox"
                checked={isTerminal}
                onChange={(e) => {
                  setIsTerminal(e.target.checked);
                  if (!e.target.checked) setStatusDestino(null);
                }}
              />
              Etapa terminal (encerra o processo seletivo)
            </label>

            {isTerminal && (
              <div>
                <Label className="mb-1">Status do candidato ao chegar aqui</Label>
                <Select
                  value={statusDestino}
                  onValueChange={(v: string | null) => setStatusDestino((v as StatusDestino) ?? null)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selecione o status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="contratado">Contratado</SelectItem>
                    <SelectItem value="reprovado">Reprovado</SelectItem>
                    <SelectItem value="desistente">Desistente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
