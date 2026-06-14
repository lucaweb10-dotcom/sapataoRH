"use client";

import { useEffect } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { useUnidadeStore } from "@/stores/unidade-store";
import type { Profile, Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function Topbar({
  profile,
  unidades,
}: {
  profile: Profile;
  unidades: Unidade[];
}) {
  const { unidadeId, setUnidade } = useUnidadeStore();

  useEffect(() => {
    if (!unidadeId && unidades.length === 1) setUnidade(unidades[0].id);
  }, [unidadeId, unidades, setUnidade]);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutro-200 bg-card px-4 shadow-warm">
      <Select
        value={unidadeId ?? "todas"}
        onValueChange={(v: string | null) =>
          setUnidade(v === "todas" ? null : v)
        }
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Unidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as unidades</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-neutro-900 sm:inline">
          {profile.nome}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
