"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ConversationWithCandidato } from "@/lib/chat/queries";

// Normalize text for search: lowercase + strip diacritics
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000); // seconds

  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

interface Props {
  conversations: ConversationWithCandidato[];
  activeId: string | null;
}

export function ConversationList({ conversations, activeId }: Props) {
  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update relative times every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Suppress unused-variable warning for tick (it drives re-render for relative times)
  void tick;

  const filtered = useMemo(() => {
    if (!query.trim()) return conversations;
    const q = normalize(query);
    return conversations.filter((c) => {
      const nome = normalize(c.candidatos?.nome ?? "");
      const preview = normalize(c.last_message_preview ?? "");
      // telefone comes from conversation via candidatos or a direct field; try uazapi_chat_id as fallback
      const telefone = normalize(c.uazapi_chat_id ?? "");
      return nome.includes(q) || preview.includes(q) || telefone.includes(q);
    });
  }, [conversations, query]);

  return (
    <div className="flex h-full flex-col border-r border-neutro-200 bg-white">
      {/* Search header */}
      <div className="border-b border-neutro-200 p-3">
        <h2 className="mb-2 font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
        <input
          type="search"
          placeholder="Buscar candidato..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-md border border-neutro-200 bg-neutro-50 px-3 text-sm text-neutro-900 placeholder:text-neutro-700 focus:border-sapatao-verde focus:outline-none"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutro-700">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          filtered.map((conv) => {
            const nome = conv.candidatos?.nome ?? "Desconhecido";
            const initial = nome.charAt(0).toUpperCase();
            const isActive = conv.id === activeId;
            const unread = conv.unread_count ?? 0;
            const unreadLabel = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

            return (
              <Link
                key={conv.id}
                href={`/chat?c=${conv.id}`}
                className={cn(
                  "flex items-start gap-3 border-b border-neutro-200 px-3 py-3 transition-colors hover:bg-neutro-50",
                  isActive && "bg-neutro-50 border-l-2 border-l-sapatao-verde",
                )}
              >
                <Avatar className="mt-0.5 shrink-0">
                  {conv.candidatos?.avatar_url ? (
                    <AvatarImage src={conv.candidatos.avatar_url} alt={nome} />
                  ) : null}
                  <AvatarFallback className="bg-sapatao-verde text-white text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium text-neutro-900">{nome}</span>
                    <span className="shrink-0 text-xs text-neutro-700">
                      {relativeTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs text-neutro-700">
                      {conv.last_message_preview ?? "Sem mensagens"}
                    </p>
                    {unreadLabel && (
                      <Badge className="shrink-0 h-4 min-w-[1rem] rounded-full bg-sapatao-verde px-1 text-[10px] text-white">
                        {unreadLabel}
                      </Badge>
                    )}
                  </div>
                  {/* Tags */}
                  {conv.candidatos?.tags && conv.candidatos.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {conv.candidatos.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-neutro-50 border border-neutro-200 px-1.5 py-px text-[10px] text-neutro-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
