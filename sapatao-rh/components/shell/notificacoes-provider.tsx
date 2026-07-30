"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";

export const SOM_STORAGE_KEY = "sapatao.som-notificacao";

const NotificacoesContext = createContext<{ naoLidas: number }>({ naoLidas: 0 });

export function useNaoLidas(): number {
  return useContext(NotificacoesContext).naoLidas;
}

function somLigado(): boolean {
  try {
    return window.localStorage.getItem(SOM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Beep curto via WebAudio (sem asset de áudio). Best-effort: o browser pode
 *  bloquear áudio sem interação prévia — falha silenciosa. */
function tocarBeep() {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close();
  } catch {
    // sem áudio — ok
  }
}

type ConversaResumo = { id: string; unread_count: number };

/**
 * Provider global de notificações (montado no layout do grupo (app)):
 * 1 canal realtime compartilhado — INSERT em messages inbound (toast + som) e
 * INSERT/UPDATE em conversations (badge de não-lidas em qualquer tela).
 * Padrão anti-StrictMode do projeto: flag `cancelled` checada após cada await;
 * .on() antes de .subscribe(); setAuth antes de subscrever.
 */
export function NotificacoesProvider({
  empresaId,
  conversasIniciais,
  children,
}: {
  empresaId: string | null;
  conversasIniciais: ConversaResumo[];
  children: ReactNode;
}) {
  const router = useRouter();

  // Mapa conversationId -> unread_count; o badge é a soma.
  const [unreadPorConversa, setUnreadPorConversa] = useState<Map<string, number>>(
    () => new Map(conversasIniciais.map((c) => [c.id, c.unread_count])),
  );
  const naoLidas = [...unreadPorConversa.values()].reduce((soma, n) => soma + n, 0);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function notificar(conversationId: string, preview: string) {
      // O payload da message não traz o nome — busca via RLS.
      const { data: conv } = await supabase
        .from("conversations")
        .select("candidatos(nome)")
        .eq("id", conversationId)
        .maybeSingle();
      if (cancelled) return;
      const nome =
        (conv as unknown as { candidatos: { nome: string } | null } | null)?.candidatos?.nome ??
        "Novo contato";
      const texto = preview ? preview.slice(0, 80) : "Nova mensagem";
      toast(`${nome}: ${texto}`, {
        action: {
          label: "Abrir",
          onClick: () => router.push(`/chat?c=${conversationId}`),
        },
      });
      if (somLigado()) tocarBeep();
    }

    // Re-aplica o token quando o supabase-js o rotaciona (~1h) — senão o socket
    // realtime silencia depois do refresh (mesmo padrão de funil/realtime.tsx).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: senão RLS filtra tudo
      if (cancelled) return;
      channel = supabase
        .channel("notificacoes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `empresa_id=eq.${empresaId}`,
          },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string;
              direction?: string;
              conteudo?: string | null;
            };
            if (row.direction !== "inbound" || !row.conversation_id) return;
            // Supressão: já estamos na Central com ESTA conversa aberta (?c= igual).
            // Lê a URL no momento do evento — dispensa useSearchParams no provider.
            const url = new URL(window.location.href);
            if (url.pathname === "/chat" && url.searchParams.get("c") === row.conversation_id) {
              return;
            }
            void notificar(row.conversation_id, row.conteudo ?? "");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `empresa_id=eq.${empresaId}`,
          },
          (payload) => {
            const row = payload.new as { id?: string; unread_count?: number };
            if (!row.id) return;
            const id = row.id;
            setUnreadPorConversa((atual) => {
              const proximo = new Map(atual);
              proximo.set(id, row.unread_count ?? 0);
              return proximo;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [empresaId, router]);

  return (
    <NotificacoesContext.Provider value={{ naoLidas }}>{children}</NotificacoesContext.Provider>
  );
}

/** Badge de não-lidas para o item Atendimento da sidebar. */
export function UnreadBadge() {
  const naoLidas = useNaoLidas();
  if (naoLidas <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-sapatao-verde px-1.5 py-0.5 text-micro leading-none font-bold text-white">
      {naoLidas > 99 ? "99+" : naoLidas}
    </span>
  );
}
