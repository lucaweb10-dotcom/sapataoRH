"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarCredenciais } from "./actions";

interface Props {
  baseUrl: string | null;
  /** ex.: "••••1234" ou null quando nunca salvo */
  tokenMascarado: string | null;
}

export function CredenciaisForm({ baseUrl, tokenMascarado }: Props) {
  const [url, setUrl] = useState(baseUrl ?? "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSalvar() {
    setSaving(true);
    try {
      // token vazio = manter o já salvo (adminToken: null)
      const r = await salvarCredenciais({ baseUrl: url, adminToken: token.trim() || null });
      if (r.error === "invalido") {
        toast.error("Confira a URL (https://...) e o admin token.");
        return;
      }
      if (r.error === "token_obrigatorio") {
        toast.error("Informe o admin token no primeiro cadastro.");
        return;
      }
      if (r.error) {
        toast.error("Erro ao salvar: " + r.error);
        return;
      }
      setToken("");
      toast.success("Credenciais salvas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-neutro-900">Credenciais UAZAPI</h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          Servidor e admin token da sua conta UAZAPI. O token nunca é exibido depois de salvo.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutro-700">URL do servidor</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.uazapi.com"
          className="w-full rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutro-700">Admin token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={tokenMascarado ?? "cole o admin token"}
          autoComplete="off"
          className="w-full rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
        {tokenMascarado && !token && (
          <span className="text-xs text-neutro-500">
            Já configurado ({tokenMascarado}). Preencha para substituir.
          </span>
        )}
      </label>
      <Button onClick={handleSalvar} disabled={saving || !url || (!token && !tokenMascarado)}>
        {saving ? "Salvando..." : "Salvar credenciais"}
      </Button>
    </div>
  );
}
