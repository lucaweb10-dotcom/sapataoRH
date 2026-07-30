"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useThrottledRefresh } from "@/lib/realtime/use-throttled-refresh";

export function ChatRealtime({ empresaId }: { empresaId: string }) {
  // Coalescido: um tenant movimentado dispararia um refetch RSC da rota inteira
  // por mensagem. O primeiro evento passa direto; o resto vira 1 refresh/500ms.
  const agendarRefresh = useThrottledRefresh();

  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // The browser client is a singleton and channel(topic) reuses an existing
    // channel by topic. Under Strict Mode (mount->cleanup->mount) the cleanup
    // runs before this async IIFE assigns `channel`, so guard with `cancelled`
    // to ensure only the live mount ever creates/subscribes a channel.
    let cancelled = false;
    // Re-apply the token whenever supabase-js rotates it (~hourly), so the
    // realtime socket keeps passing RLS across reconnects (else it goes silent).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: else RLS filters all events
      if (cancelled) return;
      channel = supabase
        .channel("chat")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `empresa_id=eq.${empresaId}` }, agendarRefresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `empresa_id=eq.${empresaId}` }, agendarRefresh)
        .subscribe();
    })();
    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [empresaId, agendarRefresh]);
  return null;
}
