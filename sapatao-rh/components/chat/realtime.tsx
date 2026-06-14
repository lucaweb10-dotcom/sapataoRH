"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function ChatRealtime({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // The browser client is a singleton and channel(topic) reuses an existing
    // channel by topic. Under Strict Mode (mount->cleanup->mount) the cleanup
    // runs before this async IIFE assigns `channel`, so guard with `cancelled`
    // to ensure only the live mount ever creates/subscribes a channel.
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: else RLS filters all events
      if (cancelled) return;
      channel = supabase
        .channel("chat")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [empresaId, router]);
  return null;
}
