"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inativarFuncionario } from "@/app/(app)/funcionarios/actions";
import { hojeIso } from "@/lib/shared/datas";

export function InativarDialog({
  open,
  onOpenChange,
  funcionarioId,
  nome,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  funcionarioId: string;
  nome: string;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [data, setData] = useState(hojeIso());
  const [pending, startTransition] = useTransition();

  const onConfirmar = () => {
    startTransition(async () => {
      const r = await inativarFuncionario(funcionarioId, { motivo, data_demissao: data });
      if (r.ok) {
        toast.success("Funcionário inativado.");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(r.error === "forbidden" ? "Sem permissão." : r.error);
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Inativar {nome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-caption font-medium text-muted-foreground">Data de desligamento</Label>
            <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-caption font-medium text-muted-foreground">Motivo</Label>
            <textarea
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-border p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              placeholder="Pedido de demissão, término de contrato…"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            className="text-destructive"
            onClick={onConfirmar}
            disabled={pending || motivo.trim().length < 3}
          >
            Inativar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
