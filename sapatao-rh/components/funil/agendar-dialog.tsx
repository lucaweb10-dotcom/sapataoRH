"use client";
import { useState } from "react";
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
import { agendarEntrevista } from "@/app/(app)/funil/actions";
import type { Entrevista } from "@/types/database";

function localDatetimeDefault(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d.toISOString().slice(0, 16); // "YYYY-MM-DDTHH:MM"
}

export function AgendarDialog({
  open,
  onOpenChange,
  candidatoId,
  candidatoNome,
  onSucesso,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  candidatoId: string;
  candidatoNome: string;
  onSucesso: (e: Entrevista) => void;
}) {
  const [pending, setPending] = useState(false);
  const [dataHora, setDataHora] = useState(localDatetimeDefault);
  const [formato, setFormato] = useState<"presencial" | "online">("presencial");
  const [localLink, setLocalLink] = useState("");
  const [obs, setObs] = useState("");

  async function submit() {
    setPending(true);
    const r = await agendarEntrevista(candidatoId, {
      data_hora: dataHora,
      formato,
      local_ou_link: localLink.trim() || null,
      observacoes: obs.trim() || null,
    });
    setPending(false);
    if (r.ok) {
      toast.success("Entrevista agendada.");
      onOpenChange(false);
      // Constrói objeto local para o modal atualizar sem refetch
      onSucesso({
        id: crypto.randomUUID(),
        empresa_id: "",
        candidato_id: candidatoId,
        data_hora: new Date(dataHora).toISOString(),
        formato,
        local_ou_link: localLink.trim() || null,
        observacoes: obs.trim() || null,
        criado_por: null,
        created_at: new Date().toISOString(),
      });
    } else {
      toast.error(
        r.error === "invalido"
          ? "Dados inválidos — verifique a data e o formato."
          : r.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao agendar a entrevista.",
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Agendar entrevista — {candidatoNome}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <Label className="mb-1">Data e hora</Label>
            <Input
              type="datetime-local"
              value={dataHora}
              onChange={(e) => setDataHora(e.target.value)}
            />
          </div>

          <div>
            <Label className="mb-1">Formato</Label>
            <div className="flex gap-4 text-sm">
              {(["presencial", "online"] as const).map((f) => (
                <label key={f} className="flex cursor-pointer items-center gap-1.5">
                  <input
                    type="radio"
                    name="formato"
                    value={f}
                    checked={formato === f}
                    onChange={() => setFormato(f)}
                  />
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label className="mb-1">{formato === "online" ? "Link da reunião" : "Local"}</Label>
            <Input
              value={localLink}
              onChange={(e) => setLocalLink(e.target.value)}
              placeholder={formato === "online" ? "https://meet.google.com/…" : "Endereço ou sala"}
              maxLength={255}
            />
          </div>

          <div>
            <Label className="mb-1">Observações</Label>
            <textarea
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="Instruções para o candidato, documentos necessários…"
              className="w-full rounded-lg border border-neutro-200 p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
          <Button onClick={submit} disabled={pending || !dataHora}>
            {pending ? "Agendando…" : "Agendar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
