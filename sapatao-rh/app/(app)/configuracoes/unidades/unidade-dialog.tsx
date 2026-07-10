"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
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
import { criarUnidade, atualizarUnidade } from "./actions";
import type { UnidadeRow } from "./page";

export function UnidadeDialog({ unidade }: { unidade?: UnidadeRow }) {
  const router = useRouter();
  const editing = !!unidade;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState("");
  const [cidade, setCidade] = useState("");
  const [endereco, setEndereco] = useState("");

  function reset() {
    setNome(unidade?.nome ?? "");
    setCidade(unidade?.cidade ?? "");
    setEndereco(unidade?.endereco ?? "");
  }

  async function submit() {
    setPending(true);
    try {
      const payload = { nome: nome.trim(), cidade: cidade.trim(), endereco: endereco.trim() };
      const r = editing ? await atualizarUnidade(unidade!.id, payload) : await criarUnidade(payload);
      if (!r.ok) {
        toast.error(
          r.error === "invalido"
            ? "Confira o nome da unidade (mínimo 2 caracteres)."
            : r.error === "forbidden"
              ? "Sem permissão."
              : "Erro ao salvar a unidade.",
        );
        return;
      }
      toast.success(editing ? "Unidade atualizada." : "Unidade criada.");
      setOpen(false);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant={editing ? "ghost" : "default"}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {editing ? (
          "Editar"
        ) : (
          <>
            <Plus className="size-4" /> Nova unidade
          </>
        )}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar unidade" : "Nova unidade"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={80}
                placeholder="Unidade Roselândia"
              />
            </div>
            <div>
              <Label className="mb-1">Cidade</Label>
              <Input
                value={cidade}
                onChange={(e) => setCidade(e.target.value)}
                maxLength={120}
                placeholder="Novo Hamburgo"
              />
            </div>
            <div>
              <Label className="mb-1">Endereço</Label>
              <Input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                maxLength={200}
                placeholder="Av. Brasil, 1234 — Roselândia"
              />
            </div>
            <p className="text-xs text-neutro-500">
              O endereço também alimenta a análise de IA (distância do candidato até a unidade).
            </p>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || nome.trim().length < 2}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
