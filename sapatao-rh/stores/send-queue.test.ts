import { describe, it, expect } from "vitest";
import { queueReducers as q, type QueueState } from "./send-queue";

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
});
