import * as React from "react"

import { cn } from "@/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  )
}

/** Bloco de texto falso — `lines` barras com a última mais curta. */
function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number
  className?: string
}) {
  return (
    <div data-slot="skeleton-text" className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-3.5", i === lines - 1 ? "w-2/3" : "w-full")}
        />
      ))}
    </div>
  )
}

/** Esqueleto de tabela com a mesma moldura do componente Table. */
function SkeletonTable({
  rows = 6,
  columns = 5,
  className,
}: {
  rows?: number
  columns?: number
  className?: string
}) {
  return (
    <div
      data-slot="skeleton-table"
      className={cn(
        "overflow-hidden rounded-xl border border-border bg-card shadow-xs",
        className
      )}
    >
      <div className="flex items-center gap-4 border-b border-border bg-muted/40 px-4 py-3">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div
          key={r}
          className="flex items-center gap-4 border-b border-border-subtle px-4 py-4 last:border-b-0"
        >
          {Array.from({ length: columns }).map((_, c) => (
            <Skeleton key={c} className="h-3.5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonText, SkeletonTable }
