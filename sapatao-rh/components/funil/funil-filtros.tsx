"use client";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Responsavel } from "@/app/(app)/candidatos/actions";

const TODOS = "todos";
const MEUS = "me";

/** Toolbar URL-driven do Kanban (?q= com debounce, ?vaga=, ?resp= com "Meus").
 *  A unidade (?u=) é do seletor da topbar — "Limpar" não mexe nela. */
export function FunilFiltros({
  vagas,
  responsaveis,
}: {
  vagas: string[];
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qUrl = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qUrl);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time sync (padrão de filtros-bar.tsx): espelha o q da URL quando ele
  // muda por fora (voltar/avançar, limpar), ignorando o eco do próprio debounce.
  const [qAplicado, setQAplicado] = useState(qUrl);
  const [prevQUrl, setPrevQUrl] = useState(qUrl);
  if (prevQUrl !== qUrl) {
    setPrevQUrl(qUrl);
    if (qUrl !== qAplicado) {
      setQ(qUrl);
      setQAplicado(qUrl);
    }
  }

  const aplicar = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === TODOS) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const onBusca = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setQAplicado(value.trim());
      aplicar({ q: value.trim() });
    }, 350);
  };

  const vaga = searchParams.get("vaga") ?? TODOS;
  const resp = searchParams.get("resp") ?? TODOS;
  const temFiltro = qUrl !== "" || vaga !== TODOS || resp !== TODOS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutro-500" />
        <Input
          value={q}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar nome ou telefone…"
          className="pl-8"
          aria-label="Buscar candidato no funil"
        />
      </div>

      {vagas.length > 0 && (
        <Select
          value={vaga}
          onValueChange={(v: string | null) => aplicar({ vaga: v })}
          items={{ [TODOS]: "Todas as vagas", ...Object.fromEntries(vagas.map((v) => [v, v])) }}
        >
          <SelectTrigger size="sm" aria-label="Filtrar por vaga">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as vagas</SelectItem>
            {vagas.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select
        value={resp}
        onValueChange={(v: string | null) => aplicar({ resp: v })}
        items={{
          [TODOS]: "Todos os responsáveis",
          [MEUS]: "Meus",
          ...Object.fromEntries(responsaveis.map((r) => [r.id, r.nome])),
        }}
      >
        <SelectTrigger size="sm" aria-label="Filtrar por responsável">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
          <SelectItem value={MEUS}>Meus</SelectItem>
          {responsaveis.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {temFiltro && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (debounce.current) clearTimeout(debounce.current);
            setQAplicado("");
            setQ("");
            aplicar({ q: null, vaga: null, resp: null });
          }}
        >
          <X className="size-3.5" />
          Limpar
        </Button>
      )}
    </div>
  );
}
