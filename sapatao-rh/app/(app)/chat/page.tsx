import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  listConversations,
  loadThread,
  getEmpresaId,
} from "@/lib/chat/queries";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { CandidatePanel } from "@/components/chat/candidate-panel";
import { ChatRealtime } from "@/components/chat/realtime";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { c } = await searchParams;
  const activeConversationId = typeof c === "string" ? c : null;

  const [empresaId, conversations] = await Promise.all([
    getEmpresaId(),
    listConversations(),
  ]);

  // Load active thread and candidato details
  let thread = { messages: [] as Awaited<ReturnType<typeof loadThread>>["messages"], hasMore: false };
  let activeCandidato: Pick<Candidato, "nome" | "telefone" | "vaga_interesse" | "etapa" | "tags" | "notas_internas" | "score_ia" | "status"> | null = null;

  if (activeConversationId) {
    const activeConv = conversations.find((c) => c.id === activeConversationId);
    if (activeConv) {
      const [threadResult] = await Promise.all([loadThread(activeConversationId)]);
      thread = threadResult;

      // Build candidato info from the embedded data + defaults
      if (activeConv.candidatos) {
        activeCandidato = {
          nome: activeConv.candidatos.nome,
          telefone: activeConv.uazapi_chat_id ?? "",
          vaga_interesse: null,
          etapa: "recebimento",
          tags: activeConv.candidatos.tags ?? [],
          notas_internas: null,
          score_ia: null,
          status: "ativo",
        };
      }
    }
  }

  // If no active conversation, pick the first one
  const displayedConvId = activeConversationId ?? conversations[0]?.id ?? null;

  return (
    <div className="flex h-full overflow-hidden">
      {/* Column 1 — Conversation list (280px) */}
      <div className="w-[280px] shrink-0">
        <ConversationList conversations={conversations} activeId={displayedConvId} />
      </div>

      {/* Column 2 — Message thread (flex-1) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {displayedConvId ? (
          <MessageThread
            key={displayedConvId}
            messages={thread.messages}
            hasMore={thread.hasMore}
            conversationId={displayedConvId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutro-700">
            Selecione uma conversa para começar.
          </div>
        )}
      </div>

      {/* Column 3 — Candidate panel (260px) */}
      {activeCandidato && (
        <div className="w-[260px] shrink-0">
          <CandidatePanel candidato={activeCandidato} />
        </div>
      )}

      {/* Realtime subscription */}
      {empresaId && <ChatRealtime empresaId={empresaId} />}
    </div>
  );
}
