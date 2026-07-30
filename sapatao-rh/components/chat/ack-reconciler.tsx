"use client";

import { useEffect, useRef } from "react";
import { reconciliarStatusDaConversa } from "@/app/(app)/chat/actions";
import { useThrottledRefresh } from "@/lib/realtime/use-throttled-refresh";

/** Intervalo do polling. Ack não é tempo real — 15s é imperceptível e barato. */
const INTERVALO_MS = 15_000;

/**
 * Mantém os ✓✓ das mensagens que NÓS enviamos em dia.
 *
 * A UAZAPI não envia `messages_update` para mensagens saídas pela própria API,
 * então o webhook nunca avança essas linhas — só a consulta ativa resolve.
 *
 * Só roda com a aba visível: em aba de fundo o polling seria gasto puro, e o
 * usuário não está olhando os ticks mesmo. Ao voltar para a aba, reconcilia na
 * hora em vez de esperar o próximo tick.
 */
export function AckReconciler({ conversationId }: { conversationId: string }) {
  const agendarRefresh = useThrottledRefresh();
  const rodandoRef = useRef(false);

  useEffect(() => {
    let cancelado = false;

    async function rodar() {
      // Evita empilhar chamadas se o provedor estiver lento.
      if (rodandoRef.current || document.visibilityState !== "visible") return;
      rodandoRef.current = true;
      try {
        const r = await reconciliarStatusDaConversa(conversationId);
        // Só refaz o fetch da tela se algo realmente mudou.
        if (!cancelado && r.atualizadas > 0) agendarRefresh();
      } catch {
        // Silencioso de propósito: é enfeite de UI a cada 15s.
      } finally {
        rodandoRef.current = false;
      }
    }

    void rodar();
    const timer = setInterval(rodar, INTERVALO_MS);
    const onVisibilidade = () => {
      if (document.visibilityState === "visible") void rodar();
    };
    document.addEventListener("visibilitychange", onVisibilidade);

    return () => {
      cancelado = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibilidade);
    };
  }, [conversationId, agendarRefresh]);

  return null;
}
