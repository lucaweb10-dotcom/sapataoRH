"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemplateFormDialog } from "./template-form-dialog";
import { excluirTemplate } from "@/app/(app)/configuracoes/templates/actions";
import type { MessageTemplate } from "@/types/database";

function TemplateRow({
  template,
  onExcluir,
}: {
  template: MessageTemplate;
  onExcluir: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-neutro-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-neutro-900">{template.nome}</p>
          <span className="rounded bg-neutro-100 px-1.5 py-0.5 text-[10px] text-neutro-700">
            {template.categoria ?? "geral"}
          </span>
          {!template.ativo && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
              inativo
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-neutro-700">
          {template.conteudo}
        </p>
      </div>
      <TemplateFormDialog template={template} />
      {confirming ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutro-700">Confirmar?</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setConfirming(false);
              onExcluir(template.id);
            }}
          >
            Sim
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Não
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirming(true)}
        >
          Excluir
        </Button>
      )}
    </div>
  );
}

export function TemplatesEditor({ templates }: { templates: MessageTemplate[] }) {
  const router = useRouter();
  const onExcluir = (id: string) => {
    excluirTemplate(id)
      .then((r: { ok: boolean; error?: string }) => {
        if (r.ok) {
          toast.success("Template excluído.");
          router.refresh();
        } else {
          toast.error(r.error === "forbidden" ? "Sem permissão." : "Não foi possível excluir.");
        }
      })
      .catch(() => toast.error("Erro ao excluir o template."));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <TemplateFormDialog />
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-neutro-700">
          Nenhum template ainda. Crie o primeiro — sugestão: um de categoria &ldquo;saudacao&rdquo;, usado no
          pré-preenchimento de novas conversas.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} onExcluir={onExcluir} />
          ))}
        </div>
      )}
    </div>
  );
}
