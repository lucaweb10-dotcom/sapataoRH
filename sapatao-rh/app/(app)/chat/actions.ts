"use server";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";

function canRead(role: string, platformAdmin: boolean): boolean {
  return role === "admin" || role === "rh" || platformAdmin;
}

/** Zera o contador de não-lidas da conversa ao abri-la. Só atualiza se houver
 *  não-lidas (`gt(0)`) para não disparar evento realtime à toa (evita loop). */
export async function marcarConversaLida(conversationId: string): Promise<{ ok: boolean }> {
  const profile = await getCurrentProfile();
  if (!profile || !canRead(profile.role, profile.platform_admin)) {
    return { ok: false };
  }
  const supabase = await createClient();
  await supabase
    .from("conversations")
    .update({ unread_count: 0 })
    .eq("id", conversationId)
    .gt("unread_count", 0);
  return { ok: true };
}
