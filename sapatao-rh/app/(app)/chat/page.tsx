import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  listConversations,
  loadThread,
  loadCandidato,
  getEmpresaId,
  type ThreadResult,
} from "@/lib/chat/queries";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { CandidatePanel } from "@/components/chat/candidate-panel";
import { ChatRealtime } from "@/components/chat/realtime";
import { MarkRead } from "@/components/chat/mark-read";
import { createClient } from "@/lib/supabase/server";
import { listCargosIa, resolverCargo, type CargoIa } from "@/lib/cv/criterios";
import type { ParecerOrigem } from "@/components/cv/parecer-view";
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

  // Default to the first conversation when none is explicitly selected.
  const displayedConvId = activeConversationId ?? conversations[0]?.id ?? null;
  const displayedConv = displayedConvId
    ? conversations.find((conv) => conv.id === displayedConvId)
    : undefined;

  // Load the displayed conversation's thread + the real candidato record.
  let thread: ThreadResult = { messages: [], hasMore: false };
  let activeCandidato: Candidato | null = null;
  let cargosIa: CargoIa[] = [];
  let parecerOrigem: ParecerOrigem | null = null;
  if (displayedConv) {
    const [threadResult, candidato, cargos] = await Promise.all([
      loadThread(displayedConv.id),
      loadCandidato(displayedConv.candidato_id),
      empresaId ? listCargosIa(empresaId) : Promise.resolve([]),
    ]);
    thread = threadResult;
    activeCandidato = candidato;
    cargosIa = cargos;

    // Origem do parecer exibido (query inline — lib/chat/queries é território do SP6).
    if (candidato?.parecer_ia) {
      const supabase = await createClient();
      const { data: ultimaOk } = await supabase
        .from("cv_analises")
        .select("origem, cargo_nome, modelo, created_at")
        .eq("candidato_id", candidato.id)
        .eq("status", "ok")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimaOk) {
        parecerOrigem = {
          fonte: ultimaOk.origem === "perfil" ? "perfil" : "cv",
          quando: ultimaOk.created_at,
          modelo: ultimaOk.modelo,
          cargo: ultimaOk.cargo_nome,
        };
      }
    }
  }

  const viewerCanAnalisar =
    profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  const viewerIsAdmin = profile.platform_admin || profile.role === "admin";
  const cargoSugerido = activeCandidato
    ? resolverCargo(cargosIa, activeCandidato.vaga_interesse)
    : null;
  const cargoSugeridoId =
    cargoSugerido && (cargoSugerido.tipo === "match" || cargoSugerido.tipo === "unico")
      ? cargoSugerido.cargo.id
      : null;

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
          {/* key: remonta o painel ao trocar de conversa (o cargo selecionado no
              botão de análise não pode vazar de um candidato para outro). */}
          <CandidatePanel
            key={displayedConvId}
            candidato={activeCandidato}
            conversationId={displayedConvId ?? undefined}
            viewerCanAnalisar={viewerCanAnalisar}
            viewerIsAdmin={viewerIsAdmin}
            cargosIa={cargosIa.map((c) => ({ id: c.id, nome: c.nome }))}
            cargoSugeridoId={cargoSugeridoId}
            parecerOrigem={parecerOrigem}
          />
        </div>
      )}

      {/* Realtime subscription + mark-read on open */}
      {empresaId && <ChatRealtime empresaId={empresaId} />}
      {displayedConvId && <MarkRead conversationId={displayedConvId} />}
    </div>
  );
}
