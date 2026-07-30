import * as React from "react"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { cardVariants } from "@/components/ui/card"

const TONE_VALUE = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
  brand: "text-primary",
} as const

type StatTone = keyof typeof TONE_VALUE

/**
 * Número em destaque do Dashboard e dos Indicadores. Com `href` vira um card
 * clicável; sem, é estático. O valor usa Fraunces + tabular-nums para não
 * "dançar" quando atualiza.
 */
function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  href,
  className,
}: {
  label: string
  value: React.ReactNode
  hint?: React.ReactNode
  icon?: React.ReactNode
  tone?: StatTone
  href?: string
  className?: string
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2 px-5">
        <span className="text-caption font-medium tracking-[0.06em] text-muted-foreground uppercase">
          {label}
        </span>
        {icon ? (
          <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>
        ) : null}
      </div>
      <div className="px-5">
        <p
          className={cn(
            "font-display text-3xl leading-none font-bold tabular",
            TONE_VALUE[tone]
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-1.5 text-caption text-muted-foreground">{hint}</p>
        ) : null}
      </div>
    </>
  )

  const classes = cn(
    cardVariants({
      tone: tone === "danger" ? "danger" : "default",
      interactive: Boolean(href),
    }),
    "gap-3",
    className
  )

  if (href) {
    return (
      <Link href={href} data-slot="stat-card" className={classes}>
        {body}
      </Link>
    )
  }

  return (
    <div data-slot="stat-card" className={classes}>
      {body}
    </div>
  )
}

export { StatCard }
