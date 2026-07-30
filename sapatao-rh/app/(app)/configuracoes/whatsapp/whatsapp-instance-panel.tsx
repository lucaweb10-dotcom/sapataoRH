"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { conectar, statusInstancia, desconectar } from "./actions";
import type { WhatsappStatus } from "@/types/database";

interface Props {
  initialStatus: WhatsappStatus;
  initialPhone: string | null;
}

const STATUS_LABELS: Record<WhatsappStatus, string> = {
  conectado: "Conectado",
  desconectado: "Desconectado",
  qr_pendente: "Aguardando QR",
  connecting: "Conectando...",
};

const STATUS_VARIANTS: Record<
  WhatsappStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  conectado: "default",
  desconectado: "destructive",
  qr_pendente: "outline",
  connecting: "secondary",
};

// How long to poll while waiting for connection (ms)
const POLL_INTERVAL = 5_000;
const POLLING_STATUSES: WhatsappStatus[] = ["qr_pendente", "connecting"];

export function WhatsappInstancePanel({ initialStatus, initialPhone }: Props) {
  const [status, setStatus] = useState<WhatsappStatus>(initialStatus);
  const [phone, setPhone] = useState<string | null>(initialPhone);
  const [qr, setQr] = useState<string | null>(null);
  const [paircode, setPaircode] = useState<string | null>(null);
  const [uazapiMissing, setUazapiMissing] = useState(false);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (pollRef.current !== null) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const pollStatus = useCallback(async () => {
    const result = await statusInstancia();
    if (result.error) return;

    const newStatus = (result.status ?? "desconectado") as WhatsappStatus;
    setStatus(newStatus);
    if (result.phone) setPhone(result.phone);
    // QR é RENOVADO pelo gateway a cada consulta — atualiza a imagem enquanto aguarda.
    if (result.qr && newStatus !== "conectado") setQr(result.qr);
    setPaircode(newStatus === "conectado" ? null : (result.paircode ?? null));

    if (newStatus === "conectado") {
      setQr(null);
      stopPolling();
      toast.success("WhatsApp conectado com sucesso!");
    }
    if (newStatus === "desconectado") {
      setQr(null);
      stopPolling();
    }
  }, [stopPolling]);

  // Start polling when status is in a pending state
  useEffect(() => {
    if (POLLING_STATUSES.includes(status)) {
      if (pollRef.current === null) {
        pollRef.current = setInterval(pollStatus, POLL_INTERVAL);
      }
    } else {
      stopPolling();
    }
    return stopPolling;
  }, [status, pollStatus, stopPolling]);

  async function handleConectar() {
    setLoading(true);
    setUazapiMissing(false);
    try {
      setPaircode(null);
      const result = await conectar();
      if (result.error === "uazapi_nao_configurada" || result.error === "uazapi_sem_admin_token") {
        setUazapiMissing(true);
        return;
      }
      if (result.error) {
        toast.error("Erro ao conectar: " + result.error);
        return;
      }
      setQr(result.qr ?? null);
      setStatus("qr_pendente");
    } catch {
      toast.error("Erro inesperado ao conectar.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDesconectar() {
    setLoading(true);
    try {
      const result = await desconectar();
      if (result.error) {
        toast.error("Erro ao desconectar: " + result.error);
        return;
      }
      setStatus("desconectado");
      setQr(null);
      setPaircode(null);
      setPhone(null);
      stopPolling();
      toast.success("WhatsApp desconectado.");
    } catch {
      toast.error("Erro inesperado ao desconectar.");
    } finally {
      setLoading(false);
    }
  }

  if (uazapiMissing) {
    return (
      <div className="rounded-lg border border-border bg-muted p-6 text-center space-y-2">
        <p className="font-semibold text-foreground">UAZAPI não configurada</p>
        <p className="text-sm text-muted-foreground">
          Salve a URL do servidor e o admin token no bloco “Credenciais UAZAPI” acima
          e tente conectar novamente.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setUazapiMissing(false)}
          disabled={loading}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-5">
      {/* Status row */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Status:</span>
        <Badge variant={STATUS_VARIANTS[status]}>{STATUS_LABELS[status]}</Badge>
        {status === "conectado" && phone && (
          <span className="text-sm text-muted-foreground">({phone})</span>
        )}
      </div>

      {/* QR code */}
      {qr && (
        <div className="flex flex-col items-center gap-3 py-2">
          <p className="text-sm text-muted-foreground">
            Aponte a câmera do WhatsApp para conectar:
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={qr}
            alt="QR Code WhatsApp"
            className="h-52 w-52 rounded-lg border border-border object-contain"
          />
          <p className="text-caption text-muted-foreground">Verificando conexão automaticamente...</p>
        </div>
      )}

      {paircode && (
        <p className="text-center text-sm text-muted-foreground">
          Ou use o código de pareamento:{" "}
          <code className="bg-muted px-1.5 py-0.5 rounded font-semibold">{paircode}</code>
        </p>
      )}

      {/* Action buttons */}
      <div className="flex gap-3">
        {status !== "conectado" && (
          <Button onClick={handleConectar} disabled={loading || POLLING_STATUSES.includes(status)}>
            {loading && status === "desconectado" ? "Conectando..." : "Conectar"}
          </Button>
        )}
        {(status === "conectado" || POLLING_STATUSES.includes(status)) && (
          <Button variant="destructive" onClick={handleDesconectar} disabled={loading}>
            Desconectar
          </Button>
        )}
      </div>
    </div>
  );
}
