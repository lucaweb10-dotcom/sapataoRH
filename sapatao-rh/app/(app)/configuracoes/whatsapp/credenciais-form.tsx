"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
    <div className="rounded-lg border border-border bg-card p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-foreground">Credenciais UAZAPI</h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Servidor e admin token da sua conta UAZAPI. O token nunca é exibido depois de salvo.
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="uazapi-url">URL do servidor</Label>
        <Input
          id="uazapi-url"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.uazapi.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="uazapi-token">Admin token</Label>
        <Input
          id="uazapi-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={tokenMascarado ?? "cole o admin token"}
          autoComplete="off"
        />
        {tokenMascarado && !token && (
          <span className="block text-caption text-muted-foreground">
            Já configurado ({tokenMascarado}). Preencha para substituir.
          </span>
        )}
      </div>
      <Button onClick={handleSalvar} disabled={saving || !url || (!token && !tokenMascarado)}>
        {saving ? "Salvando..." : "Salvar credenciais"}
      </Button>
    </div>
  );
}
