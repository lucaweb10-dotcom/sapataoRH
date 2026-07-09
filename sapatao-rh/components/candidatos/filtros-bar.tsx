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
import { STATUS_VALIDOS } from "@/lib/candidatos/filtros";
import type { FunilEtapa } from "@/types/database";

const STATUS_LABEL: Record<string, string> = {
  ativo: "Ativo",
  contratado: "Contratado",
  reprovado: "Reprovado",
  desistente: "Desistente",
};

const TODOS = "todos";

/** URL-driven toolbar: busca (debounced), status e etapa. Changing any filter
 *  resets the page param so results always start at page 1. */
export function FiltrosBar({ etapas }: { etapas: FunilEtapa[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qUrl = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qUrl);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time sync: when the URL q changes from outside (back/forward,
  // limpar), mirror it into the input — but ignore the echo of our own
  // debounced update, or it would clobber in-flight typing.
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

  const status = searchParams.get("status") ?? TODOS;
  const etapa = searchParams.get("etapa") ?? TODOS;
  const temFiltro = qUrl !== "" || status !== TODOS || etapa !== TODOS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutro-500" />
        <Input
          value={q}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar por nome ou telefone…"
          className="pl-8"
          aria-label="Buscar candidato por nome ou telefone"
        />
      </div>

      <Select
        value={status}
        onValueChange={(v: string | null) => aplicar({ status: v })}
        items={{ [TODOS]: "Todos os status", ...STATUS_LABEL }}
      >
        <SelectTrigger size="sm" aria-label="Filtrar por status">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os status</SelectItem>
          {STATUS_VALIDOS.map((s) => (
            <SelectItem key={s} value={s}>
              {STATUS_LABEL[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {etapas.length > 0 && (
        <Select
          value={etapa}
          onValueChange={(v: string | null) => aplicar({ etapa: v })}
          items={{
            [TODOS]: "Todas as etapas",
            ...Object.fromEntries(etapas.map((e) => [e.id, e.nome])),
          }}
        >
          <SelectTrigger size="sm" aria-label="Filtrar por etapa">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as etapas</SelectItem>
            {etapas.map((e) => (
              <SelectItem key={e.id} value={e.id}>
                {e.nome}
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
