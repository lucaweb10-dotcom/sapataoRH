"use client"

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"

import { cn } from "@/lib/utils"

const Tabs = TabsPrimitive.Root

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "relative flex items-center gap-1 overflow-x-auto border-b border-border",
        className
      )}
      {...props}
    />
  )
}

function TabsTab({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      data-slot="tabs-tab"
      className={cn(
        "-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 rounded-t-md border-b-2 border-transparent px-3 text-small font-medium whitespace-nowrap text-muted-foreground transition-colors duration-200 ease-soft outline-none select-none hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground disabled:pointer-events-none disabled:opacity-50 data-active:border-primary data-active:text-primary [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )
}

function TabsPanel({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      data-slot="tabs-panel"
      className={cn("mt-4 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTab, TabsPanel }
