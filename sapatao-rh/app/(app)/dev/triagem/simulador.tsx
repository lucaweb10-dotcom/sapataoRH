"use client";

import { useState } from "react";
import { Loader2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { simularTurnoAction, type SimEstado, type SimMensagem, type SimSaida } from "./actions";

const ESTADO_INICIAL: SimEstado = { ativa: true, estado: "aguardando", passo: 0, turnos: 0 };

/** Meio-dia de hoje: dentro do horário comercial por padrão. */
function meioDiaHoje(): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  return d.toISOString();
}

export function SimuladorTriagem() {
  const [mensagens, setMensagens] = useState<SimMensagem[]>([]);
  const [estado, setEstado] = useState<SimEstado>(ESTADO_INICIAL);
  const [texto, setTexto] = useState("");
  const [rodando, setRodando] = useState(false);
  const [ultima, setUltima] = useState<SimSaida | null>(null);

  // Alavancas para exercitar as travas sem precisar encenar a situação inteira.
  const [mensagensIaNaHora, setMensagensIaNaHora] = useState(0);
  const [gestorAssumiu, setGestorAssumiu] = useState(false);
  const [empresaAtiva, setEmpresaAtiva] = useState(true);
  const [agora, setAgora] = useState(meioDiaHoje());

  function reiniciar() {
    setMensagens([]);
    setEstado(ESTADO_INICIAL);
    setUltima(null);
    setTexto("");
  }

  async function enviarComoCandidato() {
    const conteudo = texto.trim();
    if (!conteudo || rodando) return;

    const nova: SimMensagem = {
      direction: "inbound",
      tipo: "text",
      conteudo,
      created_at: new Date().toISOString(),
    };
    const historico = [...mensagens, nova];
    setMensagens(historico);
    setTexto("");
    setRodando(true);

    try {
      const saida = await simularTurnoAction({
        mensagens: historico,
        estado,
        mensagensIaNaHora,
        gestorAssumiu,
        empresaAtiva,
        agora,
      });
      setUltima(saida);
      if (saida.ok && saida.estado) setEstado(saida.estado);
      if (saida.ok && saida.enviada) {
        setMensagens((m) => [
          ...m,
          {
            direction: "outbound",
            tipo: "text",
            conteudo: saida.enviada as string,
            created_at: new Date().toISOString(),
          },
        ]);
      }
    } finally {
      setRodando(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 rounded-lg border border-success/40 bg-success-soft px-3 py-2 text-caption text-success-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          Nada daqui vai para o WhatsApp. Envio, cadastro e funil são todos simulados.
        </div>

        <div className="min-h-72 space-y-2 overflow-y-auto">
          {mensagens.length === 0 ? (
            <p className="text-small text-muted-foreground">
              Escreva como se fosse o candidato chegando no WhatsApp. Ex.: &ldquo;oi, vi que tem vaga
              de frentista&rdquo;.
            </p>
          ) : (
            mensagens.map((m, i) => (
              <div
                key={i}
                className={
                  m.direction === "inbound"
                    ? "mr-auto max-w-[80%] rounded-xl bg-muted px-3 py-2 text-small"
                    : "ml-auto max-w-[80%] rounded-xl bg-primary px-3 py-2 text-small text-primary-foreground"
                }
              >
                {m.conteudo}
              </div>
            ))
          )}
          {rodando && (
            <div className="ml-auto flex items-center gap-2 rounded-xl bg-muted px-3 py-2 text-small text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> a IA está pensando…
            </div>
          )}
        </div>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void enviarComoCandidato();
          }}
        >
          <Input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Mensagem do candidato…"
            aria-label="Mensagem do candidato"
          />
          <Button type="submit" disabled={rodando || !texto.trim()}>
            <Send className="size-4" /> Enviar
          </Button>
          <Button type="button" variant="outline" onClick={reiniciar} disabled={rodando}>
            <RotateCcw className="size-4" />
            <span className="sr-only">Reiniciar</span>
          </Button>
        </form>
      </Card>

      <div className="space-y-4">
        <Card className="space-y-2 p-4">
          <p className="text-caption font-semibold text-muted-foreground uppercase">Estado</p>
          <dl className="space-y-1 text-caption">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Etapa</dt>
              <dd className="font-medium">{estado.estado}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Passo</dt>
              <dd className="font-medium">{estado.passo}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Turnos</dt>
              <dd className="font-medium">{estado.turnos}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Ativa</dt>
              <dd className="font-medium">{estado.ativa ? "sim" : "não"}</dd>
            </div>
          </dl>
        </Card>

        <Card className="space-y-3 p-4">
          <p className="text-caption font-semibold text-muted-foreground uppercase">Testar travas</p>

          <div className="space-y-1">
            <Label htmlFor="sim-teto" className="text-caption">
              Mensagens da IA na última hora
            </Label>
            <Input
              id="sim-teto"
              type="number"
              min={0}
              value={mensagensIaNaHora}
              onChange={(e) => setMensagensIaNaHora(Number(e.target.value) || 0)}
            />
            <p className="text-micro text-muted-foreground">
              Suba até o teto para ver a conversa pausar sozinha.
            </p>
          </div>

          <label className="flex items-center gap-2 text-caption">
            <input
              type="checkbox"
              checked={gestorAssumiu}
              onChange={(e) => setGestorAssumiu(e.target.checked)}
            />
            Gestor assumiu a conversa
          </label>

          <label className="flex items-center gap-2 text-caption">
            <input
              type="checkbox"
              checked={empresaAtiva}
              onChange={(e) => setEmpresaAtiva(e.target.checked)}
            />
            Triagem ligada na empresa
          </label>

          <div className="space-y-1">
            <Label htmlFor="sim-hora" className="text-caption">
              Horário simulado
            </Label>
            <Input
              id="sim-hora"
              type="datetime-local"
              value={agora.slice(0, 16)}
              onChange={(e) => setAgora(new Date(e.target.value).toISOString())}
            />
            <p className="text-micro text-muted-foreground">
              Coloque de madrugada para ver a IA não responder.
            </p>
          </div>
        </Card>

        {ultima && (
          <Card className="space-y-2 p-4">
            <p className="text-caption font-semibold text-muted-foreground uppercase">Último turno</p>
            {!ultima.ok ? (
              <p className="text-caption text-danger">{ultima.erro}</p>
            ) : (
              <>
                <p className="text-caption">
                  <span className="text-muted-foreground">Ação: </span>
                  <span className="font-medium">
                    {ultima.resultado?.acao === "enviou"
                      ? "enviou"
                      : `calou (${ultima.resultado?.motivo})`}
                  </span>
                </p>
                <p className="text-caption text-muted-foreground">
                  {ultima.modelo} · {ultima.tokens} tokens ·{" "}
                  {ultima.custoUsd ? `US$ ${ultima.custoUsd.toFixed(4)}` : "sem custo"}
                </p>
                {ultima.trilha && ultima.trilha.length > 0 && (
                  <ol className="space-y-0.5 text-micro text-muted-foreground">
                    {ultima.trilha.map((t, i) => (
                      <li key={i}>· {t}</li>
                    ))}
                  </ol>
                )}
              </>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
