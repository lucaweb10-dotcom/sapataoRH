import type { FuncionarioStatus } from "@/types/database";

const STATUS_STYLE: Record<FuncionarioStatus, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-brand-50 text-brand-700" },
  afastado: { label: "Afastado", className: "bg-[#f8ecd9] text-[#a9692a]" },
  inativo: { label: "Inativo", className: "bg-neutro-100 text-neutro-600" },
};

export function FuncionarioStatusBadge({ status }: { status: FuncionarioStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.ativo;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
