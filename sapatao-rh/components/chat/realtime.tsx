"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function ChatRealtime({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: else RLS filters all events
      channel = supabase
        .channel("chat")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [empresaId, router]);
  return null;
}
