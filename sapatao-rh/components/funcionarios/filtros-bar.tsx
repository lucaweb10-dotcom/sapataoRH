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
import type { Unidade } from "@/types/database";

const STATUS_OPCOES = [
  { value: "ativo", label: "Ativos" },
  { value: "inativo", label: "Inativos" },
  { value: "afastado", label: "Afastados" },
  { value: "todos", label: "Todos" },
];

const TODAS = "todas";

/** Toolbar URL-driven. Default de status é 'ativo' (sem param na URL);
 *  qualquer mudança de filtro reseta a página. */
export function FuncionariosFiltros({ unidades }: { unidades: Unidade[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qUrl = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qUrl);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time sync (ver candidatos/filtros-bar): espelha URL externa sem
  // clobberar digitação em andamento.
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
      if (value === null || value === "") params.delete(key);
      else params.set(key, value);
    }
    params.delete("p");
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

  const status = searchParams.get("status") ?? "ativo";
  const unidade = searchParams.get("unidade") ?? TODAS;
  const temFiltro = qUrl !== "" || searchParams.get("status") !== null || unidade !== TODAS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutro-500" />
        <Input
          value={q}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome, cargo ou CPF…"
          className="pl-8"
          aria-label="Buscar funcionário por nome, cargo ou CPF"
        />
      </div>

      <Select
        value={status}
        items={Object.fromEntries(STATUS_OPCOES.map((o) => [o.value, o.label]))}
        onValueChange={(v: string | null) => aplicar({ status: v === "ativo" ? null : v })}
      >
        <SelectTrigger size="sm" aria-label="Filtrar por status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPCOES.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {unidades.length > 1 && (
        <Select
          value={unidade}
          items={{
            [TODAS]: "Todas as unidades",
            ...Object.fromEntries(unidades.map((u) => [u.id, u.nome])),
          }}
          onValueChange={(v: string | null) => aplicar({ unidade: v === TODAS ? null : v })}
        >
          <SelectTrigger size="sm" aria-label="Filtrar por unidade">
            <SelectValue />
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
      )}

      {temFiltro && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (debounce.current) clearTimeout(debounce.current);
            setQAplicado("");
            setQ("");
            router.replace(pathname);
          }}
        >
          <X className="size-3.5" />
          Limpar
        </Button>
      )}
    </div>
  );
}
