import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Cabeçalho padrão de tela: título em Fraunces, descrição e ações à direita.
 * Toda página do app começa com ele — não escreva <h1> solto.
 */
function PageHeader({
  title,
  description,
  actions,
  className,
  children,
}: {
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}) {
  return (
    <div data-slot="page-header" className={cn("mb-6", className)}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="font-display text-display font-bold text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="max-w-2xl text-small text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </div>
  )
}

export { PageHeader }
