"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarTemplate, atualizarTemplate } from "@/app/(app)/configuracoes/templates/actions";
import { CATEGORIAS_TEMPLATE } from "@/lib/validations/template";
import type { MessageTemplate } from "@/types/database";

export function TemplateFormDialog({ template }: { template?: MessageTemplate }) {
  const router = useRouter();
  const editing = !!template;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("saudacao");
  const [conteudo, setConteudo] = useState("");
  const [ativo, setAtivo] = useState(true);

  function reset() {
    setNome(template?.nome ?? "");
    setCategoria(template?.categoria ?? "saudacao");
    setConteudo(template?.conteudo ?? "");
    setAtivo(template?.ativo ?? true);
  }

  async function submit() {
    setPending(true);
    const payload = { nome: nome.trim(), categoria: categoria.trim(), conteudo, ativo };
    const res = editing
      ? await atualizarTemplate(template!.id, payload)
      : await criarTemplate(payload);
    setPending(false);
    if (res.ok) {
      toast.success(editing ? "Template atualizado." : "Template criado.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(
        res.error === "invalido"
          ? "Confira nome, categoria (sem espaços) e conteúdo."
          : res.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao salvar o template.",
      );
    }
  }

  return (
    <>
      <Button
        size={editing ? "sm" : "default"}
        variant={editing ? "ghost" : "default"}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {editing ? "Editar" : "Novo template"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label className="mb-1">Categoria</Label>
              <Input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                list="sp6-categorias-template"
                maxLength={40}
              />
              <datalist id="sp6-categorias-template">
                {CATEGORIAS_TEMPLATE.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-neutro-500">
                &ldquo;saudacao&rdquo; é usada no pré-preenchimento de novas conversas.
              </p>
            </div>
            <div>
              <Label className="mb-1">Conteúdo</Label>
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full rounded-lg border border-neutro-200 p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={"Olá {{nome}}! Vi seu interesse na vaga {{vaga}}…"}
              />
              <p className="mt-1 text-xs text-neutro-500">
                Variáveis: {"{{nome}}"} (primeiro nome), {"{{vaga}}"} e {"{{unidade}}"} — sem
                valor, somem do texto.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutro-900">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
              Ativo (aparece no picker e no pré-preenchimento)
            </label>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim() || !conteudo.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
