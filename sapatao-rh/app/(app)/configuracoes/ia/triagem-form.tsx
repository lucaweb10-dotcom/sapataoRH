"use client";

// Configuração da triagem automática (SP8). O padrão é DESLIGADA: nada sai sem
// alguém ligar aqui de propósito.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, FlaskConical, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Section } from "@/components/ui/section";
import { CampoLista, linhasParaLista, listaParaLinhas } from "./campo-lista";
import { salvarTriagem } from "./actions";
import { ROTEIRO_PADRAO, type TriagemConfig } from "@/lib/triagem/config";

interface Props {
  ativa: boolean;
  config: TriagemConfig;
}

export function TriagemForm({ ativa: ativaInicial, config }: Props) {
  const router = useRouter();
  const [ativa, setAtiva] = useState(ativaInicial);
  const [cfg, setCfg] = useState<TriagemConfig>(config);
  const [salvando, setSalvando] = useState(false);

  function num(campo: keyof TriagemConfig, valor: string) {
    setCfg((c) => ({ ...c, [campo]: Number(valor) || 0 }));
  }

  async function salvar() {
    setSalvando(true);
    try {
      const r = await salvarTriagem({ ativa, config: cfg });
      if (r.ok) {
        toast.success(ativa ? "Triagem automática ligada." : "Triagem automática desligada.");
        router.refresh();
      } else {
        toast.error(r.error === "invalido" ? "Confira os valores." : "Não foi possível salvar.");
      }
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Section
      title="Triagem automática"
      description="A IA atende quem chega no WhatsApp, qualifica em poucas perguntas e entrega o candidato analisado."
    >
      <div className="space-y-4">
        <label className="flex items-start gap-3 rounded-lg border border-border bg-muted p-3">
          <input
            type="checkbox"
            checked={ativa}
            onChange={(e) => setAtiva(e.target.checked)}
            className="mt-0.5"
          />
          <span className="space-y-0.5">
            <span className="block text-sm font-medium">Responder automaticamente</span>
            <span className="block text-caption text-muted-foreground">
              Só vale para quem mandar mensagem primeiro. Assim que você responder uma conversa à
              mão, a IA para nela e não volta sozinha.
            </span>
          </span>
        </label>

        {ativa && (
          <div className="flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-caption text-warning-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>
              Com isto ligado, a IA manda mensagem para candidatos de verdade. Teste antes no{" "}
              <a href="/dev/triagem" className="underline">
                simulador
              </a>
              , que não envia nada.
            </span>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor="tri-apresentacao">Como a IA se apresenta</Label>
          <Input
            id="tri-apresentacao"
            value={cfg.apresentacao}
            onChange={(e) => setCfg((c) => ({ ...c, apresentacao: e.target.value }))}
            placeholder="o RH do posto"
          />
        </div>

        <div className="space-y-1">
          <Label>Roteiro de qualificação</Label>
          <p className="text-caption text-muted-foreground">
            Uma pergunta por linha, na ordem. Deixe vazio para usar o roteiro padrão.
          </p>
          <CampoLista
            value={listaParaLinhas(cfg.roteiro)}
            onChange={(texto) => setCfg((c) => ({ ...c, roteiro: linhasParaLista(texto) }))}
            placeholder={ROTEIRO_PADRAO.join("\n")}
            rows={5}
            ariaLabel="Roteiro de qualificação"
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label htmlFor="tri-debounce">Espera antes de responder (segundos)</Label>
            <Input
              id="tri-debounce"
              type="number"
              min={3}
              max={120}
              value={cfg.debounce_seg}
              onChange={(e) => num("debounce_seg", e.target.value)}
            />
            <p className="text-micro text-muted-foreground">
              Se a pessoa mandar várias seguidas, sai uma resposta só.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-turnos">Máximo de perguntas</Label>
            <Input
              id="tri-turnos"
              type="number"
              min={3}
              max={40}
              value={cfg.max_turnos}
              onChange={(e) => num("max_turnos", e.target.value)}
            />
            <p className="text-micro text-muted-foreground">
              Passou disso, entrega para atendimento humano.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-teto-hora">Teto de mensagens por hora</Label>
            <Input
              id="tri-teto-hora"
              type="number"
              min={1}
              max={30}
              value={cfg.teto_hora}
              onChange={(e) => num("teto_hora", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-teto-dia">Teto de mensagens por dia</Label>
            <Input
              id="tri-teto-dia"
              type="number"
              min={1}
              max={100}
              value={cfg.teto_dia}
              onChange={(e) => num("teto_dia", e.target.value)}
            />
            <p className="text-micro text-muted-foreground">
              Limite por conversa. Estourou, a conversa pausa e te avisa.
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-inicio">Só responde a partir das</Label>
            <Input
              id="tri-inicio"
              type="number"
              min={0}
              max={23}
              value={cfg.horario_inicio}
              onChange={(e) => num("horario_inicio", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-fim">E para às</Label>
            <Input
              id="tri-fim"
              type="number"
              min={1}
              max={24}
              value={cfg.horario_fim}
              onChange={(e) => num("horario_fim", e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="tri-followup">Cobrar quem sumiu depois de (horas)</Label>
            <Input
              id="tri-followup"
              type="number"
              min={1}
              max={168}
              value={cfg.followup_horas}
              onChange={(e) => num("followup_horas", e.target.value)}
            />
            <p className="text-micro text-muted-foreground">
              Uma única mensagem por candidato, nunca mais que isso.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar triagem
          </Button>
          <Button variant="outline" render={<a href="/dev/triagem" />}>
            <FlaskConical className="size-4" /> Abrir simulador
          </Button>
        </div>
      </div>
    </Section>
  );
}
