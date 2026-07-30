"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MODELOS_OPENAI } from "@/lib/llm/modelos";
import { salvarIntegracao, testarConexao } from "./actions";

interface Props {
  /** ex.: "••••a4F2" ou null quando nunca salva */
  apiKeyMascarada: string | null;
  modeloAtual: string;
  limiteAtual: number | null;
}

export function IntegracaoForm({ apiKeyMascarada, modeloAtual, limiteAtual }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [modelo, setModelo] = useState(modeloAtual);
  const [limite, setLimite] = useState(limiteAtual === null ? "" : String(limiteAtual));
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const modeloInfo = MODELOS_OPENAI.find((m) => m.value === modelo);
  const dirty =
    apiKey.trim() !== "" ||
    modelo !== modeloAtual ||
    limite !== (limiteAtual === null ? "" : String(limiteAtual));

  async function handleSalvar() {
    setSaving(true);
    try {
      const limiteNum = limite.trim() === "" ? null : Number(limite);
      if (limiteNum !== null && (!Number.isInteger(limiteNum) || limiteNum <= 0)) {
        toast.error("O limite mensal deve ser um número inteiro positivo (ou vazio para sem limite).");
        return;
      }
      const r = await salvarIntegracao({
        apiKey: apiKey.trim() || null, // vazio = manter a salva
        modelo,
        limiteTokensMes: limiteNum,
      });
      if (!r.ok) {
        if (r.error === "chave_obrigatoria") toast.error("Informe a chave da OpenAI no primeiro cadastro.");
        else if (r.error === "invalido") toast.error("Confira os campos — algum valor é inválido.");
        else if (r.error === "forbidden") toast.error("Você não tem permissão para alterar a integração.");
        else toast.error("Erro ao salvar: " + r.error);
        return;
      }
      const salvouChave = apiKey.trim() !== "";
      setApiKey("");
      toast.success(
        salvouChave ? "Chave salva. Clique em Testar conexão para validar." : "Integração salva.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleTestar() {
    setTesting(true);
    try {
      const r = await testarConexao();
      if (r.ok) {
        toast.success(`Conexão OK — a OpenAI respondeu com o modelo ${r.modelo}.`);
      } else if (r.error === "sem_api_key") {
        toast.error("Salve uma chave antes de testar.");
      } else if (r.error === "chave_invalida") {
        toast.error("A OpenAI recusou a chave. Confira se copiou a chave completa (começa com sk-).");
      } else {
        toast.error("Não foi possível falar com a OpenAI agora. Tente novamente em instantes.");
      }
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Integração com a OpenAI</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          A análise de currículos e perfis usa os modelos GPT da OpenAI, pagos por uso. A chave
          nunca é exibida depois de salva.
        </p>
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted-foreground">Chave da API (API key)</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={apiKeyMascarada ?? "sk-proj-..."}
          autoComplete="off"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        {apiKeyMascarada && !apiKey ? (
          <span className="text-caption text-muted-foreground">
            Já configurada ({apiKeyMascarada}). Preencha para substituir.
          </span>
        ) : !apiKeyMascarada ? (
          <span className="text-caption text-muted-foreground">
            Crie uma chave em{" "}
            <a
              href="https://platform.openai.com/api-keys"
              target="_blank"
              rel="noreferrer"
              className="text-sapatao-verde hover:underline"
            >
              platform.openai.com/api-keys
            </a>{" "}
            e cole aqui.
          </span>
        ) : null}
      </label>

      <div className="space-y-1">
        <span className="text-sm font-medium text-muted-foreground">Modelo da IA</span>
        <Select
          value={modelo}
          items={Object.fromEntries(MODELOS_OPENAI.map((m) => [m.value, m.label]))}
          onValueChange={(v: string | null) => setModelo(v ?? modeloAtual)}
        >
          <SelectTrigger className="w-full" aria-label="Modelo da IA">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODELOS_OPENAI.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <span className="flex flex-col">
                  <span className="text-sm">{m.label}</span>
                  <span className="text-caption text-muted-foreground">{m.descricao}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {modeloInfo && <p className="text-caption text-muted-foreground">{modeloInfo.descricao}</p>}
      </div>

      <label className="block space-y-1">
        <span className="text-sm font-medium text-muted-foreground">Limite mensal de tokens</span>
        <input
          type="number"
          min={0}
          step={10000}
          value={limite}
          onChange={(e) => setLimite(e.target.value)}
          placeholder="500000"
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
        <span className="block text-caption text-muted-foreground">
          Cada análise consome de 4 a 8 mil tokens (conversas longas e com áudios consomem mais).
          Com 500.000 tokens/mês dá para fazer de 60 a 120 análises — cerca de US$ 9 a 18 no modelo
          Terra. Ao atingir o limite, novas análises são bloqueadas até o mês virar.
        </span>
        {limite.trim() === "" && (
          <span className="block text-caption text-warning">
            Sem limite definido — as análises não serão bloqueadas por consumo. Recomendamos definir
            um teto.
          </span>
        )}
      </label>

      <div className="flex gap-2">
        <Button onClick={handleSalvar} disabled={saving || !dirty}>
          {saving ? "Salvando..." : "Salvar integração"}
        </Button>
        <Button
          variant="outline"
          onClick={handleTestar}
          disabled={testing || (!apiKeyMascarada && !apiKey)}
        >
          {testing ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Testando…
            </>
          ) : (
            "Testar conexão"
          )}
        </Button>
      </div>
    </div>
  );
}
