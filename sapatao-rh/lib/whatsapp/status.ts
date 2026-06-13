import type { MessageStatus } from "@/types/database";

const RANK: Record<Exclude<MessageStatus, "failed">, number> = {
  queued: 0, sent: 1, delivered: 2, read: 3,
};

/** Forward-only status transition: never regress; `failed` is terminal but
 *  cannot override an already-delivered/read message. */
export function advanceStatus(current: MessageStatus, incoming: MessageStatus): MessageStatus {
  if (current === incoming) return current;
  if (current === "failed") return "failed"; // terminal
  if (incoming === "failed") {
    return current === "delivered" || current === "read" ? current : "failed";
  }
  return RANK[incoming] > RANK[current] ? incoming : current;
}
