import { describe, it, expect, vi, beforeEach } from "vitest";
import { queueReducers as q, useSendQueue, __resetForTests, type QueueState } from "./send-queue";

const item = (id: string, conv = "c1") => ({ clientMessageId: id, conversationId: conv, texto: "oi", status: "pending" as const, attempts: 0, createdAt: "t" });

describe("send-queue reducers", () => {
  it("enqueue adds to the per-conversation queue", () => {
    const s = q.enqueue({}, item("a"));
    expect(s["c1"].map((i) => i.clientMessageId)).toEqual(["a"]);
  });
  it("nextPending returns first pending, skipping failed", () => {
    const s: QueueState = { c1: [{ ...item("a"), status: "failed" as const }, item("b")] };
    expect(q.nextPending(s, "c1")?.clientMessageId).toBe("b");
  });
  it("markStatus updates one item", () => {
    let s = q.enqueue({}, item("a"));
    s = q.markStatus(s, "c1", "a", "sent");
    expect(s["c1"][0].status).toBe("sent");
  });
  it("retry resets a failed item to pending and bumps attempts", () => {
    let s: QueueState = { c1: [{ ...item("a"), status: "failed" as const, attempts: 1 }] };
    s = q.retry(s, "c1", "a");
    expect(s["c1"][0].status).toBe("pending");
    expect(s["c1"][0].attempts).toBe(2);
  });
  it("prune removes an item by clientMessageId (server row won)", () => {
    let s = q.enqueue({}, item("a"));
    s = q.prune(s, "c1", "a");
    expect(s["c1"] ?? []).toEqual([]);
  });
  it("nextPending skips sending and sent items, returns next pending", () => {
    const s: QueueState = {
      c1: [
        { ...item("a"), status: "sending" as const },
        { ...item("b"), status: "sent" as const },
        item("c"),
      ],
    };
    expect(q.nextPending(s, "c1")?.clientMessageId).toBe("c");
  });
});

// ── helper: create a deferred promise ─────────────────────────────────────────
function deferred<T = void>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe("useSendQueue worker", () => {
  beforeEach(() => {
    // Reset module-level running set and store state between tests.
    __resetForTests();
    useSendQueue.setState({ queue: {} });
    vi.restoreAllMocks();
  });

  it("dispatch payload + sequential + sent: enqueue one item, worker marks sent", async () => {
    const dispatch = vi.fn(async () => undefined);
    useSendQueue.getState().enqueueAndRun(
      { clientMessageId: "m1", conversationId: "c1", texto: "hello" },
      dispatch,
    );
    await vi.waitFor(() => {
      const status = useSendQueue.getState().queue["c1"]?.[0]?.status;
      expect(status).toBe("sent");
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ clientMessageId: "m1", conversationId: "c1", texto: "hello" });
  });

  it("re-entrancy guard: second enqueueAndRun for same conversation does not spawn a second worker", async () => {
    const d = deferred();
    let callCount = 0;
    const dispatch = vi.fn(async () => {
      callCount++;
      await d.promise;
    });

    const store = useSendQueue.getState();
    // Enqueue first item and start worker (will block on deferred).
    store.enqueueAndRun({ clientMessageId: "m1", conversationId: "c1", texto: "a" }, dispatch);
    // Enqueue second item before first resolves — worker should still be running, not spawned again.
    store.enqueueAndRun({ clientMessageId: "m2", conversationId: "c1", texto: "b" }, dispatch);

    // Worker is blocked on first item; dispatch called exactly once so far.
    await vi.waitFor(() => expect(callCount).toBeGreaterThanOrEqual(1));
    expect(dispatch).toHaveBeenCalledTimes(1);

    // Resolve the deferred; worker should drain and process the second item.
    d.resolve();
    await vi.waitFor(() => {
      expect(useSendQueue.getState().queue["c1"]?.[1]?.status).toBe("sent");
    });
    // Total dispatch calls = 2 (one per item, not more).
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("exception → failed + worker survives (running cleared, next item can run)", async () => {
    const dispatch = vi.fn(async () => { throw new Error("network error"); });

    useSendQueue.getState().enqueueAndRun(
      { clientMessageId: "m1", conversationId: "c1", texto: "fail" },
      dispatch,
    );
    await vi.waitFor(() => {
      expect(useSendQueue.getState().queue["c1"]?.[0]?.status).toBe("failed");
    });

    // running should be cleared → a subsequent enqueue can run.
    const dispatch2 = vi.fn(async () => undefined);
    useSendQueue.getState().enqueueAndRun(
      { clientMessageId: "m2", conversationId: "c1", texto: "ok" },
      dispatch2,
    );
    await vi.waitFor(() => {
      expect(useSendQueue.getState().queue["c1"]?.[1]?.status).toBe("sent");
    });
    expect(dispatch2).toHaveBeenCalledTimes(1);
  });

  it("failed item doesn't block: worker dispatches next pending, skips failed", async () => {
    // Pre-seed queue with item a already marked failed, then enqueue b.
    useSendQueue.setState({
      queue: { c1: [{ ...item("a"), status: "failed" as const }] },
    });

    const dispatch = vi.fn(async () => undefined);
    useSendQueue.getState().enqueueAndRun(
      { clientMessageId: "b", conversationId: "c1", texto: "second" },
      dispatch,
    );
    await vi.waitFor(() => {
      const items = useSendQueue.getState().queue["c1"] ?? [];
      const b = items.find((i) => i.clientMessageId === "b");
      expect(b?.status).toBe("sent");
    });
    // dispatch was called for "b" only, never re-dispatches "a".
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ clientMessageId: "b" }),
    );
  });

  it("parallel across conversations: two enqueues on different conversations both dispatch", async () => {
    const d1 = deferred();
    const d2 = deferred();
    let calls: string[] = [];

    const dispatch = vi.fn(async (payload: { clientMessageId: string; conversationId: string; texto: string }) => {
      calls.push(payload.conversationId);
      if (payload.conversationId === "c1") await d1.promise;
      else await d2.promise;
    });

    const store = useSendQueue.getState();
    store.enqueueAndRun({ clientMessageId: "m1", conversationId: "c1", texto: "x" }, dispatch);
    store.enqueueAndRun({ clientMessageId: "m2", conversationId: "c2", texto: "y" }, dispatch);

    // Both workers should start independently and call dispatch before either resolves.
    await vi.waitFor(() => {
      expect(calls).toContain("c1");
      expect(calls).toContain("c2");
    });

    // Resolve both.
    d1.resolve();
    d2.resolve();

    await vi.waitFor(() => {
      expect(useSendQueue.getState().queue["c1"]?.[0]?.status).toBe("sent");
      expect(useSendQueue.getState().queue["c2"]?.[0]?.status).toBe("sent");
    });
  });
});
