"use client";

import { useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import type { Message, MessageStatus } from "@/types/database";
import { useSendQueue, type QueueItem, type QueueItemStatus } from "@/stores/send-queue";
import { Composer } from "./composer";

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

// ── Status icons ───────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: MessageStatus | QueueItemStatus }) {
  if (status === "pending" || status === "sending") {
    // Clock/spinner
    return (
      <span className="ml-1 inline-flex items-center" aria-label="enviando">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className={cn("size-3", status === "sending" && "animate-spin")}
        >
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z"
            clipRule="evenodd"
          />
        </svg>
      </span>
    );
  }

  if (status === "sent") {
    return <span className="ml-1" aria-label="enviado">✓</span>;
  }

  if (status === "delivered") {
    return <span className="ml-1" aria-label="entregue">✓✓</span>;
  }

  if (status === "read") {
    return <span className="ml-1 text-blue-300" aria-label="lido">✓✓</span>;
  }

  // "failed" — handled separately at bubble level, no icon here
  return null;
}

// ── Displayed item types ───────────────────────────────────────────────────────

type DisplayedMessage =
  | { kind: "server"; msg: Message }
  | { kind: "queue"; item: QueueItem };

function groupByDate(items: DisplayedMessage[]): { date: string; items: DisplayedMessage[] }[] {
  const groups: { date: string; items: DisplayedMessage[] }[] = [];
  let currentDate = "";

  for (const item of items) {
    const rawDate =
      item.kind === "server"
        ? (item.msg.enviada_em ?? item.msg.created_at)
        : item.item.createdAt;
    const date = formatDate(rawDate);
    if (date !== currentDate) {
      currentDate = date;
      groups.push({ date, items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

// ── Main component ─────────────────────────────────────────────────────────────

export function MessageThread({ messages, hasMore, conversationId }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Zustand store selectors
  const queue = useSendQueue((s) => s.queue);
  const storeRetry = useSendQueue((s) => s.retry);
  const storePrune = useSendQueue((s) => s.prune);
  const enqueueAndRun = useSendQueue((s) => s.enqueueAndRun);

  // Queue items for this conversation
  const queueItems: QueueItem[] = useMemo(() => queue[conversationId] ?? [], [queue, conversationId]);

  // Prune queue items once their server row arrives
  useEffect(() => {
    if (queueItems.length === 0) return;
    const serverIds = new Set(messages.map((m) => m.client_message_id).filter(Boolean));
    for (const item of queueItems) {
      if (serverIds.has(item.clientMessageId)) {
        storePrune(conversationId, item.clientMessageId);
      }
    }
  }, [messages, queueItems, conversationId, storePrune]);

  // Build deduped display list: server rows + queue-only items
  const displayed: DisplayedMessage[] = useMemo(() => {
    const serverClientIds = new Set(messages.map((m) => m.client_message_id).filter(Boolean));
    const queueOnly = queueItems.filter((item) => !serverClientIds.has(item.clientMessageId));
    const serverItems: DisplayedMessage[] = messages.map((msg) => ({ kind: "server", msg }));
    const queueDisplayed: DisplayedMessage[] = queueOnly.map((item) => ({ kind: "queue", item }));
    // Merge chronologically: server messages are already sorted, queue items go after (they are new)
    return [...serverItems, ...queueDisplayed];
  }, [messages, queueItems]);

  // Scroll to bottom when conversation changes or displayed list grows
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationId, displayed.length]);

  const groups = groupByDate(displayed);

  // Retry handler: re-dispatch with the same clientMessageId
  function handleRetry(item: QueueItem) {
    storeRetry(conversationId, item.clientMessageId);
    enqueueAndRun(
      { clientMessageId: item.clientMessageId, conversationId, texto: item.texto },
      async (payload) => {
        const res = await fetch("/api/whatsapp/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: payload.conversationId,
            texto: payload.texto,
            clientMessageId: payload.clientMessageId,
          }),
        });
        return { ok: res.ok };
      },
    );
  }

  return (
    <div className="flex h-full flex-col bg-neutro-50">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {hasMore && (
          <p className="mb-3 text-center text-xs text-neutro-700">
            Exibindo as últimas 60 mensagens.
          </p>
        )}

        {displayed.length === 0 ? (
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
                  {group.items.map((displayedItem) => {
                    if (displayedItem.kind === "server") {
                      const msg = displayedItem.msg;
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
                                  <>
                                    {" "}— {" "}
                                    <a
                                      href={msg.midia_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="underline"
                                    >
                                      ver
                                    </a>
                                  </>
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
                                <StatusIcon status={msg.status} />
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // Queue item — always outbound optimistic bubble
                    const item = displayedItem.item;
                    const isFailed = item.status === "failed";

                    return (
                      <div key={item.clientMessageId} className="flex justify-end">
                        <div className="max-w-[75%] space-y-1">
                          <div
                            className={cn(
                              "rounded-2xl rounded-tr-sm px-3 py-2 text-sm shadow-sm",
                              isFailed
                                ? "bg-red-100 text-red-900 border border-red-200"
                                : "bg-sapatao-verde text-white opacity-90",
                            )}
                          >
                            <p className="whitespace-pre-wrap break-words">{item.texto}</p>
                            <p
                              className={cn(
                                "mt-1 text-right text-[10px]",
                                isFailed ? "text-red-600" : "text-white/70",
                              )}
                            >
                              {formatTime(item.createdAt)}
                              {!isFailed && <StatusIcon status={item.status} />}
                              {isFailed && (
                                <span className="ml-1 font-medium text-red-600" aria-label="falhou">
                                  ✗
                                </span>
                              )}
                            </p>
                          </div>

                          {/* Failed actions */}
                          {isFailed && (
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => handleRetry(item)}
                                className="rounded px-2 py-0.5 text-xs font-medium text-sapatao-verde underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-sapatao-verde"
                              >
                                Reenviar
                              </button>
                              <button
                                type="button"
                                onClick={() => storePrune(conversationId, item.clientMessageId)}
                                className="rounded px-2 py-0.5 text-xs font-medium text-neutro-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-neutro-400"
                              >
                                Descartar
                              </button>
                            </div>
                          )}
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

      {/* Composer */}
      <Composer conversationId={conversationId} />
    </div>
  );
}
