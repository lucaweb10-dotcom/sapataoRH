"use client";

import { useEffect } from "react";
import { marcarConversaLida } from "@/app/(app)/chat/actions";

/** Marks the open conversation as read (zeroes unread) when it mounts/changes. */
export function MarkRead({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    void marcarConversaLida(conversationId);
  }, [conversationId]);
  return null;
}
