import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Estado vazio padrão (lista sem resultado, filtro sem match, área não
 * configurada). Sempre com uma saída: passe `action` com o próximo passo.
 */
function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactNode
  className?: string
}) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center",
        className
      )}
    >
      {icon ? (
        <div className="grid size-11 place-items-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
          {icon}
        </div>
      ) : null}
      <div className="space-y-1">
        <p className="font-display text-section font-semibold text-foreground">
          {title}
        </p>
        {description ? (
          <p className="mx-auto max-w-sm text-small text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-1 flex items-center gap-2">{action}</div> : null}
    </div>
  )
}

export { EmptyState }
