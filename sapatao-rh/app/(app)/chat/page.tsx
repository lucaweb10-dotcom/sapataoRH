import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  listConversations,
  loadThread,
  loadCandidato,
  getEmpresaId,
  type ThreadResult,
} from "@/lib/chat/queries";
import { getFunilComEtapas } from "@/lib/funil/queries";
import { listVagasDistintas } from "@/lib/candidatos/queries";
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { CandidatePanel } from "@/components/chat/candidate-panel";
import { ChatRealtime } from "@/components/chat/realtime";
import { MarkRead } from "@/components/chat/mark-read";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  const { c } = await searchParams;
  const activeConversationId = typeof c === "string" ? c : null;

  const [empresaId, conversations, funil, vagas, responsaveis] = await Promise.all([
    getEmpresaId(),
    listConversations(),
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
  ]);

  // Default to the first conversation when none is explicitly selected.
  const displayedConvId = activeConversationId ?? conversations[0]?.id ?? null;
  const displayedConv = displayedConvId
    ? conversations.find((conv) => conv.id === displayedConvId)
    : undefined;

  // Load the displayed conversation's thread + the real candidato record.
  let thread: ThreadResult = { messages: [], hasMore: false };
  let activeCandidato: Candidato | null = null;
  if (displayedConv) {
    const [threadResult, candidato] = await Promise.all([
      loadThread(displayedConv.id),
      loadCandidato(displayedConv.candidato_id),
    ]);
    thread = threadResult;
    activeCandidato = candidato;
  }

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

      {/* Column 3 — Candidate ACTION panel (260px) */}
      {activeCandidato && (
        <div className="w-[260px] shrink-0">
          <CandidatePanel
            candidato={activeCandidato}
            etapas={funil?.etapas ?? []}
            vagas={vagas}
            responsaveis={responsaveis}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* Realtime subscription + mark-read on open */}
      {empresaId && <ChatRealtime empresaId={empresaId} />}
      {displayedConvId && <MarkRead conversationId={displayedConvId} />}
    </div>
  );
}
