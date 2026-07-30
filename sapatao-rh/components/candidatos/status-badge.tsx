import type { Candidato } from "@/types/database";

type Status = Candidato["status"];

const STATUS_STYLE: Record<Status, { label: string; className: string }> = {
  ativo: { label: "Ativo", className: "bg-brand-50 text-brand-700" },
  contratado: { label: "Contratado", className: "bg-[#e3f2e6] text-[#1f7a33]" },
  reprovado: { label: "Reprovado", className: "bg-[#fbe6df] text-[#c0492b]" },
  desistente: { label: "Desistente", className: "bg-muted text-muted-foreground" },
};

export function StatusBadge({ status }: { status: Status }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.ativo;
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-micro font-medium ${s.className}`}
    >
      {s.label}
    </span>
  );
}
