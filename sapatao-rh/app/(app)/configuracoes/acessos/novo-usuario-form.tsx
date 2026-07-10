"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLES = ["admin", "rh", "gestor_unidade", "viewer"] as const;

const ROLE_LABEL: Record<(typeof ROLES)[number], string> = {
  admin: "Admin",
  rh: "RH",
  gestor_unidade: "Gestor de unidade",
  viewer: "Visualizador",
};

const ERRORS: Record<string, string> = {
  email_exists: "Já existe um usuário com esse e-mail.",
  invalid: "Verifique os campos do formulário.",
  forbidden: "Você não tem permissão.",
};

export function NovoUsuarioForm({ unidades }: { unidades: Unidade[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("rh");
  const [unidadeId, setUnidadeId] = useState<string>(
    unidades[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: fd.get("nome"),
        email: fd.get("email"),
        senha: fd.get("senha"),
        role,
        unidades_acesso: unidadeId ? [unidadeId] : [],
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Usuário criado.");
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(ERRORS[body.error] ?? "Não foi possível criar o usuário.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button>Novo usuário</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              name="senha"
              type="text"
              minLength={6}
              required
            />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select
              value={role}
              onValueChange={(v: string | null) => {
                if (v) setRole(v);
              }}
              items={ROLE_LABEL}
            >
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select
              value={unidadeId}
              onValueChange={(v: string | null) => {
                setUnidadeId(v ?? "");
              }}
              items={Object.fromEntries(unidades.map((u) => [u.id, u.nome]))}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Selecione uma unidade" />
              </SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
