"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/configuracoes/acessos", label: "Acessos" },
  { href: "/configuracoes/whatsapp", label: "WhatsApp" },
  { href: "/configuracoes/funil", label: "Funil" },
  { href: "/configuracoes/ia", label: "IA" },
];

export function SettingsNav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex gap-1 border-b border-neutro-200">
      {ITEMS.map((it) => {
        const active = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? "border-sapatao-verde text-sapatao-verde"
                : "border-transparent text-neutro-700 hover:text-neutro-900"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
