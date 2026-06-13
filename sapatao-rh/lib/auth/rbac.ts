import type { Role } from "@/types/database";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  roles: Role[];
}

export const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["admin", "rh", "gestor_unidade", "viewer"] },
  { key: "chat", label: "Atendimento", href: "/chat", roles: ["admin", "rh"] },
  { key: "funil", label: "Funil", href: "/funil", roles: ["admin", "rh", "gestor_unidade"] },
  { key: "candidatos", label: "Candidatos", href: "/candidatos", roles: ["admin", "rh", "gestor_unidade"] },
  { key: "funcionarios", label: "Funcionários", href: "/funcionarios", roles: ["admin", "rh"] },
  { key: "indicadores", label: "Indicadores", href: "/indicadores", roles: ["admin", "rh", "gestor_unidade"] },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes/acessos", roles: ["admin"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccessPath(role: Role, path: string): boolean {
  const item = NAV.find((i) => path === i.href || path.startsWith(i.href + "/") || matchesSection(i, path));
  if (!item) return true; // unknown paths handled by their own item; default allow
  return item.roles.includes(role);
}

function matchesSection(item: NavItem, path: string): boolean {
  // configuracoes item guards the whole /configuracoes/* section
  if (item.key === "configuracoes") return path.startsWith("/configuracoes");
  const seg = "/" + item.key;
  return path === seg || path.startsWith(seg + "/");
}

export function canSeeUnidade(
  profile: { platform_admin: boolean; unidades_acesso: string[] },
  unidadeId: string,
): boolean {
  if (profile.platform_admin) return true;
  return profile.unidades_acesso.includes(unidadeId);
}
