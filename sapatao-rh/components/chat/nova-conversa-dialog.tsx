"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";
import {
  buscarCandidatosSemConversa,
  iniciarConversa,
  type CandidatoBusca,
} from "@/app/(app)/candidatos/actions";

/** "Nova conversa" no header da Central: busca candidatos SEM conversa
 *  (nome/telefone, debounce) e atalho para cadastrar um novo candidato. */
export function NovaConversaDialog({
  vagas,
  unidades,
}: {
  vagas: string[];
  unidades: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onBusca = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const termo = value.trim();
      if (termo.length < 2) {
        setResultados([]);
        return;
      }
      setBuscando(true);
      try {
        setResultados(await buscarCandidatosSemConversa(termo));
      } finally {
        setBuscando(false);
      }
    }, 350);
  };

  const abrirConversa = async (candidatoId: string) => {
    setPendingId(candidatoId);
    try {
      const r = await iniciarConversa(candidatoId);
      if (r.ok) {
        setOpen(false);
        router.push(`/chat?c=${r.conversationId}&tpl=saudacao`);
      } else {
        toast.error("Não foi possível iniciar a conversa.");
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setQ("");
          setResultados([]);
          setOpen(true);
        }}
      >
        <MessageSquarePlus className="size-3.5" />
        Nova conversa
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={q}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar candidato sem conversa (nome ou telefone)…"
              autoFocus
            />
            {buscando ? (
              <p className="text-sm text-muted-foreground">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {q.trim().length < 2
                  ? "Digite ao menos 2 caracteres para buscar."
                  : "Nenhum candidato sem conversa encontrado."}
              </p>
            ) : (
              <ul className="max-h-64 divide-y divide-border-subtle overflow-y-auto">
                {resultados.map((cand) => (
                  <li key={cand.id}>
                    <button
                      type="button"
                      onClick={() => abrirConversa(cand.id)}
                      disabled={pendingId !== null}
                      className="flex w-full items-center justify-between gap-2 px-1 py-2 text-left text-sm hover:bg-muted disabled:opacity-50"
                    >
                      <span className="truncate font-medium text-foreground">{cand.nome}</span>
                      <span className="shrink-0 text-caption text-muted-foreground">
                        {pendingId === cand.id ? "Abrindo…" : cand.telefone}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-border pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setNovoOpen(true);
                }}
              >
                + Cadastrar novo candidato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NovoCandidatoDialog
        vagas={vagas}
        unidades={unidades}
        withTrigger={false}
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onCreated={(id) => void abrirConversa(id)}
      />
    </>
  );
}
