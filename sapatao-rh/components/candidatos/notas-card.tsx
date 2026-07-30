"use client";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarNotas } from "@/app/(app)/funil/actions";

export function NotasCard({
  candidatoId,
  notas: notasIniciais,
  canEdit,
}: {
  candidatoId: string;
  notas: string | null;
  canEdit: boolean;
}) {
  const [notas, setNotas] = useState(notasIniciais ?? "");
  const [pending, startTransition] = useTransition();

  const onSalvar = () => {
    startTransition(async () => {
      const r = await salvarNotas({ candidatoId, notas });
      if (r.ok) toast.success("Notas salvas.");
      else toast.error("Erro ao salvar notas.");
    });
  };

  if (!canEdit) {
    return notas ? (
      <p className="whitespace-pre-wrap text-sm text-foreground">{notas}</p>
    ) : (
      <p className="text-sm text-muted-foreground">Sem anotações.</p>
    );
  }

  return (
    <div>
      <textarea
        value={notas}
        onChange={(e) => setNotas(e.target.value)}
        disabled={pending}
        rows={4}
        className="w-full rounded-lg border border-border p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        placeholder="Anotações da equipe…"
      />
      <div className="mt-1.5 flex justify-end">
        <Button size="sm" variant="outline" onClick={onSalvar} disabled={pending}>
          Salvar notas
        </Button>
      </div>
    </div>
  );
}
