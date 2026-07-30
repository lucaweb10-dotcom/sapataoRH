"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/configuracoes/acessos", label: "Acessos" },
  { href: "/configuracoes/whatsapp", label: "WhatsApp" },
  { href: "/configuracoes/unidades", label: "Unidades" },
  { href: "/configuracoes/funil", label: "Funil" },
  { href: "/configuracoes/ia", label: "IA" },
  { href: "/configuracoes/templates", label: "Templates" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-border">
      {ITEMS.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-sapatao-verde text-sapatao-verde"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
