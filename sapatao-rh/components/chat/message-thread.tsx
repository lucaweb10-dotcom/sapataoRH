"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { Message } from "@/types/database";

interface Props {
  messages: Message[];
  hasMore: boolean;
  conversationId: string;
}

function formatTime(dateStr: string): string {
  return new Date(dateStr).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (d.toDateString() === today.toDateString()) return "Hoje";
  if (d.toDateString() === yesterday.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function groupByDate(messages: Message[]): { date: string; messages: Message[] }[] {
  const groups: { date: string; messages: Message[] }[] = [];
  let currentDate = "";

  for (const msg of messages) {
    const date = formatDate(msg.created_at);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, messages: [] });
    }
    groups[groups.length - 1].messages.push(msg);
  }
  return groups;
}

export function MessageThread({ messages, hasMore, conversationId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Scroll to bottom when conversation changes or messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationId, messages.length]);

  const groups = groupByDate(messages);

  return (
    <div className="flex h-full flex-col bg-neutro-50">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasMore && (
          <p className="mb-3 text-center text-xs text-neutro-700">
            Exibindo as últimas 60 mensagens.
          </p>
        )}

        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-neutro-700">
            Sem mensagens nesta conversa.
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.date}>
                {/* Date divider */}
                <div className="my-3 flex items-center gap-2">
                  <div className="h-px flex-1 bg-neutro-200" />
                  <span className="rounded-full bg-neutro-200 px-2 py-0.5 text-xs text-neutro-700">
                    {group.date}
                  </span>
                  <div className="h-px flex-1 bg-neutro-200" />
                </div>

                <div className="space-y-2">
                  {group.messages.map((msg) => {
                    const isOutbound = msg.direction === "outbound";
                    return (
                      <div
                        key={msg.id}
                        className={cn(
                          "flex",
                          isOutbound ? "justify-end" : "justify-start",
                        )}
                      >
                        <div
                          className={cn(
                            "max-w-[75%] rounded-2xl px-3 py-2 text-sm shadow-sm",
                            isOutbound
                              ? "rounded-tr-sm bg-sapatao-verde text-white"
                              : "rounded-tl-sm bg-white text-neutro-900 border border-neutro-200",
                          )}
                        >
                          {msg.tipo === "text" || msg.tipo === "system" ? (
                            <p className="whitespace-pre-wrap break-words">{msg.conteudo}</p>
                          ) : (
                            <p className="italic opacity-75">
                              [{msg.tipo}
                              {msg.midia_url ? (
                                <> — <a href={msg.midia_url} target="_blank" rel="noopener noreferrer" className="underline">ver</a></>
                              ) : null}]
                            </p>
                          )}
                          <p
                            className={cn(
                              "mt-1 text-right text-[10px]",
                              isOutbound ? "text-white/70" : "text-neutro-700",
                            )}
                          >
                            {formatTime(msg.enviada_em ?? msg.created_at)}
                            {isOutbound && msg.status && (
                              <span className="ml-1">
                                {msg.status === "read" ? "✓✓" : msg.status === "delivered" ? "✓✓" : "✓"}
                              </span>
                            )}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Disabled composer — SP1b */}
      <div className="border-t border-neutro-200 bg-white p-3">
        <textarea
          disabled
          placeholder="Envio chega na próxima etapa (SP1b)"
          rows={2}
          className="w-full resize-none rounded-lg border border-neutro-200 bg-neutro-50 px-3 py-2 text-sm text-neutro-700 placeholder:text-neutro-700 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none"
        />
      </div>
    </div>
  );
}
