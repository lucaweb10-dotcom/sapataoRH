"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { salvarWebhookPublico } from "./actions";

interface EventoRow {
  id: string;
  created_at: string;
  event: string | null;
  parsed_kind: string;
  payload: Record<string, unknown>;
}

interface Props {
  publicUrl: string | null;
  instanciaProvisionada: boolean;
  eventos: EventoRow[];
}

export function WebhookPanel({ publicUrl, instanciaProvisionada, eventos }: Props) {
  const [url, setUrl] = useState(publicUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSalvar() {
    setSaving(true);
    try {
      const r = await salvarWebhookPublico({ url });
      if (r.error === "invalido") return void toast.error("URL inválida (use https://...).");
      if (r.error === "sem_instancia")
        return void toast.error("Conecte o WhatsApp primeiro (bloco acima).");
      if (r.error) return void toast.error("Erro: " + r.error);
      toast.success(
        r.registered
          ? "Webhook registrado na UAZAPI."
          : "URL salva. O webhook será registrado ao conectar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Webhook (recebimento)</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          URL pública que a UAZAPI usa para entregar mensagens. Rodando local, suba um túnel
          (<code className="bg-muted px-1 rounded">cloudflared tunnel --url http://localhost:3000</code>)
          e cole aqui a URL gerada.
        </p>
      </div>
      <div className="flex gap-2">
        <Input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://abc.trycloudflare.com"
          aria-label="URL pública do webhook"
          className="flex-1"
        />
        <Button onClick={handleSalvar} disabled={saving || !url}>
          {saving ? "Registrando..." : "Salvar e registrar"}
        </Button>
      </div>
      {!instanciaProvisionada && (
        <p className="text-caption text-warning-foreground">
          A instância ainda não foi conectada — a URL fica salva e o registro acontece no Conectar.
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-foreground">Últimos eventos recebidos</h3>
        {eventos.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum evento ainda. Depois de registrar o webhook, mande um “oi” para o número
            conectado e recarregue.
          </p>
        ) : (
          <ul className="divide-y divide-border-subtle text-sm">
            {eventos.map((ev) => (
              <li key={ev.id} className="py-2">
                <details>
                  <summary className="cursor-pointer flex items-center gap-2">
                    <span className="text-muted-foreground tabular-nums">
                      {new Date(ev.created_at).toLocaleString("pt-BR")}
                    </span>
                    <code className="bg-muted px-1 rounded">{ev.event ?? "?"}</code>
                    <span className="text-muted-foreground">→ {ev.parsed_kind}</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-muted p-2 text-caption">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
