"use client";
import { useEffect } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useThrottledRefresh } from "@/lib/realtime/use-throttled-refresh";

/** Refreshes the board when any candidato in this empresa changes (e.g. another
 *  user moves a card, or a new WhatsApp lead is auto-placed). Coalescido em
 *  1 refresh/500ms — uma importação em lote dispararia um evento por card. */
export function FunilRealtime({ empresaId }: { empresaId: string }) {
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
        .channel("funil")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "candidatos", filter: `empresa_id=eq.${empresaId}` },
          agendarRefresh,
        )
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
