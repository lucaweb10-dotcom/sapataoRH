"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  Columns3,
  Users,
  UserRoundCheck,
  ChartColumn,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { navItemsForRole } from "@/lib/auth/rbac";
import { UnreadBadge } from "@/components/shell/notificacoes-provider";
import type { Profile, Role } from "@/types/database";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  chat: MessagesSquare,
  funil: Columns3,
  candidatos: Users,
  funcionarios: UserRoundCheck,
  indicadores: ChartColumn,
  configuracoes: Settings,
};

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Sidebar({ role, profile }: { role: Role; profile: Profile }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-lg bg-brand-700 font-display text-base font-bold text-neutro-50">
          S
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold text-foreground">Sapatão</div>
          <div className="text-micro font-medium tracking-wide text-muted-foreground">RH</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-brand-700 shadow-warm"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              <Icon className={cn("size-[18px]", active ? "text-brand-700" : "text-muted-foreground")} />
              {item.label}
              {item.key === "chat" && <UnreadBadge />}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card px-3 py-2.5 shadow-warm">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-caption font-bold text-neutro-50">
            {initials(profile.nome)}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-small font-semibold text-foreground">
              {profile.nome}
            </div>
            <div className="text-micro capitalize text-muted-foreground">{profile.role}</div>
          </div>
        </div>
        <div className="pride-rule mx-1 mt-3" />
      </div>
    </aside>
  );
}
