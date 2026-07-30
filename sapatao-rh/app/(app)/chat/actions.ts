"use server";

import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadThread, type ThreadResult } from "@/lib/chat/queries";
import { findMessages } from "@/lib/uazapi/client";
import { getUazapiConfig } from "@/lib/uazapi/config";
import { reconciliarAcks, NAO_TERMINAIS } from "@/lib/whatsapp/reconciliar-ack";
import type { MessageStatus } from "@/types/database";

function canRead(role: string, platformAdmin: boolean): boolean {
  return role === "admin" || role === "rh" || platformAdmin;
}

/**
 * Página anterior da thread (scroll infinito para cima).
 * `before` é o `created_at` da mensagem mais antiga já na tela — cursor keyset,
 * então mensagem nova chegando durante a rolagem não desloca a janela.
 * A leitura passa por RLS (createClient de sessão), não pelo service role.
 */
export async function carregarMensagensAnteriores(
  conversationId: string,
  before: string,
): Promise<ThreadResult> {
  const profile = await getCurrentProfile();
  if (!profile || !canRead(profile.role, profile.platform_admin)) {
    return { messages: [], hasMore: false };
  }
  return loadThread(conversationId, before);
}

/** Teto de mensagens consultadas por rodada — conversa antiga não vira varredura. */
const ACK_LOTE = 100;

/**
 * Pergunta ao provedor o ack das mensagens que nós enviamos.
 *
 * A UAZAPI não empurra `messages_update` para mensagens enviadas pela própria
 * API, então sem isto o ✓✓ nunca aparece. Chamada pelo cliente a cada 15s
 * enquanto a conversa está aberta E a aba visível.
 *
 * Nunca lança: falha de provedor é silenciosa (é enfeite de UI, não pode
 * derrubar a tela nem gerar toast a cada 15s).
 */
export async function reconciliarStatusDaConversa(
  conversationId: string,
): Promise<{ atualizadas: number }> {
  const profile = await getCurrentProfile();
  if (!profile || !canRead(profile.role, profile.platform_admin)) return { atualizadas: 0 };

  const admin = createAdminClient();

  // Escopo do tenant conferido na mão: usamos service role para ler o token.
  const { data: conv } = await admin
    .from("conversations")
    .select("id, empresa_id, candidato_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.empresa_id !== profile.empresa_id) return { atualizadas: 0 };

  const [{ data: cand }, { data: inst }] = await Promise.all([
    admin.from("candidatos").select("telefone").eq("id", conv.candidato_id).maybeSingle(),
    admin
      .from("whatsapp_instances")
      .select("uazapi_token")
      .eq("empresa_id", profile.empresa_id)
      .maybeSingle(),
  ]);
  if (!cand?.telefone || !inst?.uazapi_token) return { atualizadas: 0 };

  const cfg = await getUazapiConfig(admin, profile.empresa_id);
  if (!cfg) return { atualizadas: 0 };

  const chatid = `${cand.telefone.replace(/\D/g, "")}@s.whatsapp.net`;

  try {
    return await reconciliarAcks({
      listarPendentes: async () => {
        const { data } = await admin
          .from("messages")
          .select("id, uazapi_msg_id, status")
          .eq("conversation_id", conversationId)
          .eq("direction", "outbound")
          .in("status", NAO_TERMINAIS)
          .not("uazapi_msg_id", "is", null)
          .order("created_at", { ascending: false })
          .limit(ACK_LOTE);
        return (data ?? []).map((m) => ({
          id: m.id as string,
          uazapi_msg_id: m.uazapi_msg_id as string,
          status: m.status as MessageStatus,
        }));
      },
      buscarNoProvedor: () =>
        findMessages(cfg.baseUrl, inst.uazapi_token as string, { chatid, limit: ACK_LOTE }),
      atualizar: async (id, status) => {
        await admin.from("messages").update({ status }).eq("id", id);
      },
    });
  } catch {
    return { atualizadas: 0 };
  }
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
  // NOTE: phone-side read-sync via UAZAPI /chat/read (lib/uazapi/client.markChatRead)
  // is intentionally deferred until the instance is actually connected — it is a no-op
  // without UAZAPI credentials. SP1b ships the in-app unread badge; the phone sync rides
  // with the live integration.
  return { ok: true };
}
