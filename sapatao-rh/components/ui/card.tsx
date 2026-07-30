import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Superfície padrão do app. Sem padding próprio: o respiro vem de `gap-5 py-5`
 * no Card e de `px-5` nas partes, para que uma tabela possa encostar nas bordas.
 */
const cardVariants = cva("flex flex-col gap-5 rounded-xl border py-5", {
  variants: {
    tone: {
      default: "border-border bg-card text-card-foreground shadow-xs",
      success: "border-success/25 bg-success-soft text-success-foreground",
      warning: "border-warning/25 bg-warning-soft text-warning-foreground",
      danger: "border-danger/25 bg-danger-soft text-danger-foreground",
      muted: "border-border-subtle bg-muted text-foreground",
      ghost: "border-transparent bg-transparent",
    },
    interactive: {
      true: "cursor-pointer transition-[box-shadow,transform,border-color] duration-200 ease-soft outline-none hover:-translate-y-px hover:border-border-strong hover:shadow-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
      false: "",
    },
  },
  defaultVariants: {
    tone: "default",
    interactive: false,
  },
})

function Card({
  className,
  tone,
  interactive,
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof cardVariants>) {
  return (
    <div
      data-slot="card"
      className={cn(cardVariants({ tone, interactive, className }))}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min grid-cols-[1fr_auto] items-start gap-x-3 gap-y-1 px-5 has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("font-display text-section font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-small text-muted-foreground", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn(
        "col-start-2 row-span-2 row-start-1 flex items-center gap-2 self-start justify-self-end",
        className
      )}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="card-content" className={cn("px-5", className)} {...props} />
  )
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center gap-2 px-5", className)}
      {...props}
    />
  )
}

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardAction,
  CardContent,
  CardFooter,
  cardVariants,
}
