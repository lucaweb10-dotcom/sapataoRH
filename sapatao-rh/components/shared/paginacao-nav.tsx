"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Prev/next pager that preserves the current filters in the URL. */
export function PaginacaoNav({
  page,
  totalPaginas,
  resumo,
}: {
  page: number;
  totalPaginas: number;
  resumo: string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const hrefDaPagina = (p: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (p <= 1) params.delete("p");
    else params.set("p", String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  if (totalPaginas <= 1) {
    return <p className="text-xs text-neutro-500">{resumo}</p>;
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs text-neutro-500">{resumo}</p>
      <div className="flex items-center gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={page <= 1}
          render={page > 1 ? <Link href={hrefDaPagina(page - 1)} /> : undefined}
        >
          <ChevronLeft className="size-3.5" />
          Anterior
        </Button>
        <span className="px-1 text-xs tabular-nums text-neutro-700">
          {Math.min(page, totalPaginas)}/{totalPaginas}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={page >= totalPaginas}
          render={page < totalPaginas ? <Link href={hrefDaPagina(page + 1)} /> : undefined}
        >
          Próxima
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
