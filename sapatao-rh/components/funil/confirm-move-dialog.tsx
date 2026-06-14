"use client";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export function ConfirmMoveDialog({
  open,
  onOpenChange,
  nome,
  etapaNome,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  nome: string;
  etapaNome: string;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar movimentação</DialogTitle>
          <DialogDescription>
            Mover <strong>{nome}</strong> para <strong>{etapaNome}</strong>? Esta é uma etapa crítica.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={onConfirm}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
