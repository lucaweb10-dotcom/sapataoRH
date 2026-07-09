"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import type { Profile, Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TODAS = "todas";

/** O seletor de unidade escreve ?u= na URL atual — as telas server-side
 *  (Funil etc.) leem o parâmetro e filtram de verdade (spec SP6 §6). */
export function Topbar({ profile, unidades }: { profile: Profile; unidades: Unidade[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const unidadeId = searchParams.get("u") ?? TODAS;

  const onUnidade = (v: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!v || v === TODAS) params.delete("u");
    else params.set("u", v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutro-200 bg-card px-4 shadow-warm">
      <Select value={unidadeId} onValueChange={onUnidade}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Unidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as unidades</SelectItem>
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
