"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

/** Refreshes the board when any candidato in this empresa changes (e.g. another
 *  user moves a card, or a new WhatsApp lead is auto-placed). */
export function FunilRealtime({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Re-apply the token whenever supabase-js rotates it (~hourly), so the
    // realtime socket keeps passing RLS across reconnects (else it goes silent).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: else RLS filters all events
      channel = supabase
        .channel("funil")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "candidatos", filter: `empresa_id=eq.${empresaId}` },
          () => router.refresh(),
        )
        .subscribe();
    })();
    return () => {
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [empresaId, router]);
  return null;
}
