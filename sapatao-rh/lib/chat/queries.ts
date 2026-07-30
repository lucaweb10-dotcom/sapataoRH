import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import type { Candidato, Conversation, Message, MessageTemplate } from "@/types/database";
import { signedMediaUrls } from "./signed-url";
import { MESSAGES_PAGE_SIZE } from "./paginacao";

// Conversations with embedded candidato data (PostgREST embed)
export type ConversationWithCandidato = Conversation & {
  candidatos: Pick<Candidato, "nome" | "avatar_url" | "tags" | "telefone" | "atribuido_a"> | null;
};

export type MessageWithSignedUrl = Message & { midia_signed_url: string | null };

export type ThreadResult = {
  messages: MessageWithSignedUrl[];
  hasMore: boolean;
};

/** Returns all conversations for the logged-in user's empresa (RLS-scoped),
 *  with embedded candidato nome/avatar_url/tags, newest first. */
export async function listConversations(): Promise<ConversationWithCandidato[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("*, candidatos(nome, avatar_url, tags, telefone, atribuido_a)")
    .order("last_message_at", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[chat/queries] listConversations error:", error);
    return [];
  }

  // PostgREST returns the embedded shape as part of the row;
  // cast explicitly because supabase-js inference doesn't infer nested selects.
  return (data ?? []) as ConversationWithCandidato[];
}

/** Returns the last page of messages of a conversation, reversed to chronological
 *  order. `before` (ISO de created_at) pagina para trás; hasMore=true quando
 *  ainda existe mensagem mais antiga que a página devolvida. */
export async function loadThread(
  conversationId: string,
  before?: string | null,
): Promise<ThreadResult> {
  const supabase = await createClient();
  let q = supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE + 1);

  // Cursor keyset, não offset: com offset uma mensagem nova chegando durante a
  // rolagem deslocaria a janela e duplicaria/puliria linhas.
  if (before) q = q.lt("created_at", before);

  const { data, error } = await q;

  if (error) {
    console.error("[chat/queries] loadThread error:", error);
    return { messages: [], hasMore: false };
  }

  const rows = (data ?? []) as Message[];
  const hasMore = rows.length === MESSAGES_PAGE_SIZE + 1;
  // We fetched newest-first; reverse to get chronological order for display.
  const ordered = (hasMore ? rows.slice(0, MESSAGES_PAGE_SIZE) : rows).reverse();
  // Attach signed URLs for any stored media paths (TTL 1h, RLS-scoped).
  const paths = ordered.map((m) => m.midia_url).filter((p): p is string => !!p);
  const urls = await signedMediaUrls(paths);
  const messages = ordered.map((m) => ({
    ...m,
    midia_signed_url: m.midia_url ? (urls.get(m.midia_url) ?? null) : null,
  }));

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

/** Templates de mensagem ativos da empresa (RLS-scoped), ordenados por categoria/nome. */
export async function listTemplatesAtivos(): Promise<MessageTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });
  if (error) {
    console.error("[chat/queries] listTemplatesAtivos error:", error);
    return [];
  }
  return (data ?? []) as MessageTemplate[];
}
