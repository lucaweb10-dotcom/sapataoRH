import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import type { Candidato, Conversation, Message } from "@/types/database";

// Conversations with embedded candidato data (PostgREST embed)
export type ConversationWithCandidato = Conversation & {
  candidatos: Pick<Candidato, "nome" | "avatar_url" | "tags" | "telefone"> | null;
};

export type ThreadResult = {
  messages: Message[];
  hasMore: boolean;
};

/** Returns all conversations for the logged-in user's empresa (RLS-scoped),
 *  with embedded candidato nome/avatar_url/tags, newest first. */
export async function listConversations(): Promise<ConversationWithCandidato[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, candidatos(nome, avatar_url, tags, telefone)")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[chat/queries] listConversations error:", error);
    return [];
  }

  // PostgREST returns the embedded shape as part of the row;
  // cast explicitly because supabase-js inference doesn't infer nested selects.
  return (data ?? []) as ConversationWithCandidato[];
}

/** Returns the last 61 messages of a conversation, reversed to chronological order.
 *  hasMore=true if there are more than 60 messages. */
export async function loadThread(conversationId: string): Promise<ThreadResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(61);

  if (error) {
    console.error("[chat/queries] loadThread error:", error);
    return { messages: [], hasMore: false };
  }

  const rows = (data ?? []) as Message[];
  const hasMore = rows.length === 61;
  // We fetched newest-first; reverse to get chronological order for display.
  const messages = (hasMore ? rows.slice(0, 60) : rows).reverse();

  return { messages, hasMore };
}

/** Returns the full candidato record (RLS-scoped) for the chat context panel. */
export async function loadCandidato(candidatoId: string): Promise<Candidato | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidatos")
    .select("*")
    .eq("id", candidatoId)
    .single<Candidato>();
  if (error) {
    console.error("[chat/queries] loadCandidato error:", error);
    return null;
  }
  return data;
}

/** Returns the empresa_id of the currently logged-in user. */
export async function getEmpresaId(): Promise<string | null> {
  const profile = await getCurrentProfile();
  return profile?.empresa_id ?? null;
}
