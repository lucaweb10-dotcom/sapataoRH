"use client";

// Copiloto do gestor (SP8): conversa PRIVADA sobre o candidato aberto.
// O candidato nunca vê nada daqui — o aviso fica visível no cabeçalho.
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Bot, Loader2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface Props {
  candidatoId: string;
  candidatoNome: string;
  canUsar: boolean; // admin | rh | platform_admin
  isAdmin: boolean;
}

type Turno = { role: "user" | "assistant"; conteudo: string };

const SUGESTOES = [
  "Resume o que esse candidato já me disse",
  "Ele tem experiência com atendimento ao público?",
  "Que pergunta falta fazer antes da entrevista?",
];

export function CopilotoDialog({ candidatoId, candidatoNome, canUsar, isAdmin }: Props) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [pergunta, setPergunta] = useState("");
  const [carregando, setCarregando] = useState(false);
  const fimRef = useRef<HTMLDivElement>(null);

  // Só rola quando chega turno novo — não a cada render.
  useEffect(() => {
    if (turnos.length) fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turnos.length]);

  if (!canUsar) return null;

  async function enviar(texto: string) {
    const limpo = texto.trim();
    if (!limpo || carregando) return;

    setTurnos((t) => [...t, { role: "user", conteudo: limpo }]);
    setPergunta("");
    setCarregando(true);
    try {
      const res = await fetch("/api/ia/copiloto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ candidatoId, pergunta: limpo }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        resposta?: string;
        error?: string;
        message?: string;
      };

      if (res.ok && data.ok && data.resposta) {
        setTurnos((t) => [...t, { role: "assistant", conteudo: data.resposta as string }]);
        return;
      }

      const mensagem = data.message ?? "Não consegui responder agora.";
      if (isAdmin && (data.error === "chave_invalida" || data.error === "limite_excedido")) {
        toast.error(mensagem, {
          action: { label: "Configurar IA", onClick: () => router.push("/configuracoes/ia") },
        });
      } else {
        toast.error(mensagem);
      }
      // Devolve a pergunta pro campo: o gestor não perde o que escreveu.
      setTurnos((t) => t.slice(0, -1));
      setPergunta(limpo);
    } catch {
      toast.error("Erro de rede ao falar com o copiloto.");
      setTurnos((t) => t.slice(0, -1));
      setPergunta(limpo);
    } finally {
      setCarregando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button size="sm" variant="outline" className="w-full" />}>
        <Bot className="size-4" /> Perguntar à IA sobre este candidato
      </DialogTrigger>

      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Copiloto — {candidatoNome}</DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Lock className="size-3.5 shrink-0" />
            Conversa privada. O candidato não vê nada daqui.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[45vh] min-h-40 space-y-3 overflow-y-auto pr-1">
          {turnos.length === 0 ? (
            <div className="space-y-2">
              <p className="text-small text-muted-foreground">
                A IA lê a conversa do WhatsApp, o cadastro e o parecer deste candidato. Ela responde
                só com o que está aí — se não souber, diz que não consta.
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGESTOES.map((s) => (
                  <Button key={s} size="xs" variant="outline" onClick={() => enviar(s)}>
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            turnos.map((t, i) => (
              <div
                key={i}
                className={
                  t.role === "user"
                    ? "ml-auto max-w-[85%] rounded-xl bg-primary px-3 py-2 text-small text-primary-foreground"
                    : "mr-auto max-w-[85%] rounded-xl bg-muted px-3 py-2 text-small whitespace-pre-wrap"
                }
              >
                {t.conteudo}
              </div>
            ))
          )}
          {carregando && (
            <div className="mr-auto flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-small text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> pensando…
            </div>
          )}
          <div ref={fimRef} />
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(pergunta);
          }}
        >
          <textarea
            value={pergunta}
            onChange={(e) => setPergunta(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void enviar(pergunta);
              }
            }}
            rows={2}
            placeholder="Pergunte sobre este candidato…"
            aria-label="Pergunta para o copiloto"
            className="flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
          <Button type="submit" size="icon" disabled={carregando || !pergunta.trim()}>
            {carregando ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            <span className="sr-only">Enviar</span>
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
