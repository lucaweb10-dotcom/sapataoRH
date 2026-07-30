"use client";

// Botão "Analisar perfil com IA" (SP3b): roda direto (decisão do usuário), com
// seletor híbrido de cargo — pré-selecionado pela vaga de interesse do candidato.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface CargoOpcao {
  id: string;
  nome: string;
}

interface Props {
  conversationId: string;
  jaTemParecer: boolean;
  canAnalisar: boolean; // admin | rh | platform_admin
  isAdmin: boolean; // p/ ações "Configurar IA" nos toasts
  cargos: CargoOpcao[];
  cargoSugeridoId: string | null;
}

const FRASES = [
  "Lendo a conversa…",
  "Transcrevendo áudios…",
  "Aplicando os critérios da empresa…",
  "Escrevendo o parecer…",
];

const ERRO_FALLBACK: Record<string, string> = {
  sem_mensagens: "Esta conversa ainda não tem conteúdo suficiente para análise.",
  cargo_indefinido: "Escolha o cargo da análise no seletor acima.",
  chave_invalida: "A OpenAI recusou a chave da empresa.",
  limite_excedido: "A cota mensal de tokens da empresa foi atingida.",
  ia_indisponivel: "A IA está indisponível no momento. Tente novamente em alguns minutos.",
  parecer_invalido: "A IA retornou um resultado inválido. Tente novamente.",
  persist_falhou: "Falha ao salvar a análise. Tente novamente.",
};

export function AnalisarPerfilButton({
  conversationId,
  jaTemParecer,
  canAnalisar,
  isAdmin,
  cargos,
  cargoSugeridoId,
}: Props) {
  const router = useRouter();
  const [cargoId, setCargoId] = useState<string | null>(cargoSugeridoId);
  const [analisando, setAnalisando] = useState(false);
  const [fraseIdx, setFraseIdx] = useState(0);

  useEffect(() => {
    if (!analisando) return;
    const timer = setInterval(() => {
      setFraseIdx((i) => Math.min(i + 1, FRASES.length - 1));
    }, 6000);
    return () => clearInterval(timer);
  }, [analisando]);

  if (!canAnalisar) return null;

  const precisaEscolherCargo = cargos.length > 0 && !cargoId;

  async function handleAnalisar() {
    setFraseIdx(0);
    setAnalisando(true);
    try {
      const res = await fetch("/api/perfil/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, cargoId: cargoId ?? undefined }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        score?: number;
        movido?: boolean;
        error?: string;
        message?: string;
      };

      if (res.ok && data.ok) {
        toast.success(
          `Análise concluída — score ${data.score}/100.` +
            (data.movido ? ' Card movido para "Análise IA Concluída".' : ""),
        );
        router.refresh();
        return;
      }

      const code = data.error ?? "ia_indisponivel";
      const mensagem = data.message ?? ERRO_FALLBACK[code] ?? "Erro ao analisar o perfil.";
      if (isAdmin && (code === "chave_invalida" || code === "limite_excedido")) {
        toast.error(mensagem, {
          action: {
            label: code === "limite_excedido" ? "Ajustar limite" : "Configurar IA",
            onClick: () => router.push("/configuracoes/ia"),
          },
        });
      } else if (code === "chave_invalida") {
        toast.error("A IA ainda não foi configurada. Peça a um administrador para ativar em Configurações > IA.");
      } else if (code === "limite_excedido") {
        toast.error(mensagem + " Avise um administrador.");
      } else {
        toast.error(mensagem);
      }
    } catch {
      toast.error("Erro de rede ao analisar o perfil. Verifique a conexão e tente novamente.");
    } finally {
      setAnalisando(false);
    }
  }

  return (
    <div className="space-y-2">
      {cargos.length > 0 && (
        <div className="space-y-1">
          <span className="text-caption font-medium text-muted-foreground">Analisar para a vaga:</span>
          <Select
            value={cargoId}
            items={Object.fromEntries(cargos.map((c) => [c.id, c.nome]))}
            onValueChange={(v: string | null) => setCargoId(v)}
          >
            <SelectTrigger size="sm" className="w-full" aria-label="Cargo da análise">
              <SelectValue placeholder="Escolha o cargo" />
            </SelectTrigger>
            <SelectContent>
              {cargos.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button
        size="sm"
        variant={jaTemParecer ? "outline" : "default"}
        className="w-full"
        onClick={handleAnalisar}
        disabled={analisando || precisaEscolherCargo}
      >
        {analisando ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Analisando…
          </>
        ) : jaTemParecer ? (
          <>
            <RefreshCw className="size-4" /> Reanalisar perfil com IA
          </>
        ) : (
          <>
            <Sparkles className="size-4" /> Analisar perfil com IA
          </>
        )}
      </Button>

      {analisando ? (
        <div aria-busy="true" className="space-y-0.5 text-caption text-muted-foreground">
          <p>{FRASES[fraseIdx]}</p>
          <p>Pode levar até 1 minuto. Você pode continuar navegando.</p>
        </div>
      ) : precisaEscolherCargo ? (
        <p className="text-caption text-muted-foreground">Escolha o cargo para liberar a análise.</p>
      ) : jaTemParecer ? (
        <p className="text-caption text-muted-foreground">O parecer atual será substituído.</p>
      ) : cargos.length === 0 ? (
        <p className="text-caption text-muted-foreground">
          Análise geral —{" "}
          {isAdmin ? (
            <a href="/configuracoes/ia" className="text-sapatao-verde hover:underline">
              cadastre cargos em Configurações &gt; IA
            </a>
          ) : (
            "cadastre cargos em Configurações > IA"
          )}{" "}
          para critérios específicos.
        </p>
      ) : null}
    </div>
  );
}
