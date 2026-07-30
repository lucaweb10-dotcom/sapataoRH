import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Bloco titulado dentro de uma página (ex.: "Próximas entrevistas").
 * Um nível abaixo do PageHeader: título em Fraunces 18, sem borda própria.
 */
function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  className?: string
  children: React.ReactNode
}) {
  return (
    <section data-slot="section" className={cn("space-y-3", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-0.5">
            {title ? (
              <h2 className="font-display text-section font-semibold text-foreground">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-caption text-muted-foreground">{description}</p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex items-center gap-2">{actions}</div>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  )
}

export { Section }
