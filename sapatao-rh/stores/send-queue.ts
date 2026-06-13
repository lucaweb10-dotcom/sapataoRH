import { create } from "zustand";

export type QueueItemStatus = "pending" | "sending" | "sent" | "delivered" | "read" | "failed";

export interface QueueItem {
  clientMessageId: string;
  conversationId: string;
  texto: string;
  status: QueueItemStatus;
  attempts: number;
  createdAt: string;
}

export type QueueState = Record<string, QueueItem[]>;

// ── pure reducers ──────────────────────────────────────────────────────────────

function enqueue(state: QueueState, item: QueueItem): QueueState {
  const conv = state[item.conversationId] ?? [];
  return { ...state, [item.conversationId]: [...conv, item] };
}

function nextPending(state: QueueState, conversationId: string): QueueItem | undefined {
  return (state[conversationId] ?? []).find((i) => i.status === "pending");
}

function markStatus(
  state: QueueState,
  conversationId: string,
  clientMessageId: string,
  status: QueueItemStatus,
): QueueState {
  const conv = state[conversationId] ?? [];
  return {
    ...state,
    [conversationId]: conv.map((i) =>
      i.clientMessageId === clientMessageId ? { ...i, status } : i,
    ),
  };
}

function retry(state: QueueState, conversationId: string, clientMessageId: string): QueueState {
  const conv = state[conversationId] ?? [];
  return {
    ...state,
    [conversationId]: conv.map((i) =>
      i.clientMessageId === clientMessageId
        ? { ...i, status: "pending" as const, attempts: i.attempts + 1 }
        : i,
    ),
  };
}

function prune(state: QueueState, conversationId: string, clientMessageId: string): QueueState {
  const conv = state[conversationId] ?? [];
  return {
    ...state,
    [conversationId]: conv.filter((i) => i.clientMessageId !== clientMessageId),
  };
}

export const queueReducers = { enqueue, nextPending, markStatus, retry, prune };

// ── running set: prevents concurrent processing per conversation ───────────────
const running = new Set<string>();

// ── Zustand store ─────────────────────────────────────────────────────────────

interface SendQueueStore {
  queue: QueueState;
  enqueueAndRun: (
    item: Omit<QueueItem, "status" | "attempts" | "createdAt"> & Partial<Pick<QueueItem, "createdAt">>,
    dispatch: (payload: {
      clientMessageId: string;
      conversationId: string;
      texto: string;
    }) => Promise<unknown>,
  ) => void;
  markStatus: (conversationId: string, clientMessageId: string, status: QueueItemStatus) => void;
  retry: (conversationId: string, clientMessageId: string) => void;
  prune: (conversationId: string, clientMessageId: string) => void;
}

export const useSendQueue = create<SendQueueStore>((set, get) => ({
  queue: {},

  enqueueAndRun(item, dispatch) {
    const fullItem: QueueItem = {
      ...item,
      status: "pending",
      attempts: 0,
      createdAt: item.createdAt ?? new Date().toISOString(),
    };
    set((s) => ({ queue: enqueue(s.queue, fullItem) }));
    processQueue(item.conversationId, dispatch, get, set);
  },

  markStatus(conversationId, clientMessageId, status) {
    set((s) => ({ queue: markStatus(s.queue, conversationId, clientMessageId, status) }));
  },

  retry(conversationId, clientMessageId) {
    set((s) => ({ queue: retry(s.queue, conversationId, clientMessageId) }));
  },

  prune(conversationId, clientMessageId) {
    set((s) => ({ queue: prune(s.queue, conversationId, clientMessageId) }));
  },
}));

function processQueue(
  conversationId: string,
  dispatch: (payload: { clientMessageId: string; conversationId: string; texto: string }) => Promise<unknown>,
  get: () => SendQueueStore,
  set: (fn: (s: SendQueueStore) => Partial<SendQueueStore>) => void,
): void {
  if (running.has(conversationId)) return;

  async function run() {
    running.add(conversationId);
    try {
      while (true) {
        const pending = nextPending(get().queue, conversationId);
        if (!pending) break;

        // mark sending
        set((s) => ({ queue: markStatus(s.queue, conversationId, pending.clientMessageId, "sending") }));

        try {
          await dispatch({
            clientMessageId: pending.clientMessageId,
            conversationId: pending.conversationId,
            texto: pending.texto,
          });
          set((s) => ({ queue: markStatus(s.queue, conversationId, pending.clientMessageId, "sent") }));
        } catch {
          set((s) => ({ queue: markStatus(s.queue, conversationId, pending.clientMessageId, "failed") }));
        }
      }
    } finally {
      running.delete(conversationId);
    }
  }

  void run();
}
