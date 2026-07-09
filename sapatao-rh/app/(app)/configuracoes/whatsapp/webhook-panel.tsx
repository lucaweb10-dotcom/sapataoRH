"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-neutro-900">Webhook (recebimento)</h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          URL pública que a UAZAPI usa para entregar mensagens. Rodando local, suba um túnel
          (<code className="bg-neutro-100 px-1 rounded">cloudflared tunnel --url http://localhost:3000</code>)
          e cole aqui a URL gerada.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://abc.trycloudflare.com"
          className="flex-1 rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
        <Button onClick={handleSalvar} disabled={saving || !url}>
          {saving ? "Registrando..." : "Salvar e registrar"}
        </Button>
      </div>
      {!instanciaProvisionada && (
        <p className="text-xs text-amber-700">
          A instância ainda não foi conectada — a URL fica salva e o registro acontece no Conectar.
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutro-900">Últimos eventos recebidos</h3>
        {eventos.length === 0 ? (
          <p className="text-sm text-neutro-500">
            Nenhum evento ainda. Depois de registrar o webhook, mande um “oi” para o número
            conectado e recarregue.
          </p>
        ) : (
          <ul className="divide-y divide-neutro-100 text-sm">
            {eventos.map((ev) => (
              <li key={ev.id} className="py-2">
                <details>
                  <summary className="cursor-pointer flex items-center gap-2">
                    <span className="text-neutro-500 tabular-nums">
                      {new Date(ev.created_at).toLocaleString("pt-BR")}
                    </span>
                    <code className="bg-neutro-100 px-1 rounded">{ev.event ?? "?"}</code>
                    <span className="text-neutro-600">→ {ev.parsed_kind}</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutro-50 p-2 text-xs">
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
