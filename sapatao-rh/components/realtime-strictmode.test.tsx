import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { StrictMode } from "react";

/**
 * Reproduction for the runtime error:
 *   "cannot add `postgres_changes` callbacks for realtime:chat after `subscribe()`"
 *
 * Root cause: the supabase browser client is a singleton (@supabase/ssr) and
 * RealtimeClient.channel(topic) REUSES an existing channel with the same topic.
 * The realtime effects create the channel inside an async IIFE, while cleanup is
 * synchronous. Under React Strict Mode (default in dev) the effect runs
 * mount -> cleanup -> mount; the first mount's late IIFE leaves a subscribed
 * channel behind, and the next call to channel(topic) returns that already
 * subscribed channel, so `.on("postgres_changes", ...)` runs AFTER subscribe().
 *
 * The fake below mimics the real channel-reuse-by-topic semantics and records
 * every time `.on("postgres_changes")` is invoked on an already subscribed
 * channel — that invariant must never be violated.
 */

const h = vi.hoisted(() => {
  const onAfterSubscribe: string[] = [];

  function makeClient() {
    const channels: Array<{ topic: string; subscribed: boolean; removed: boolean }> = [];

    function makeChannel(topic: string) {
      const ch = {
        topic,
        subscribed: false,
        removed: false,
        on(type: string) {
          if (type === "postgres_changes" && ch.subscribed) {
            onAfterSubscribe.push(ch.topic); // invariant violation
          }
          return ch;
        },
        subscribe() {
          ch.subscribed = true;
          return ch;
        },
      };
      return ch;
    }

    return {
      auth: {
        getSession: vi.fn(async () => ({ data: { session: { access_token: "tok" } } })),
        onAuthStateChange: vi.fn(() => ({
          data: { subscription: { unsubscribe: vi.fn() } },
        })),
      },
      realtime: { setAuth: vi.fn(async () => {}) },
      channel(topic: string) {
        const realtimeTopic = `realtime:${topic}`;
        const exists = channels.find((c) => c.topic === realtimeTopic && !c.removed);
        if (exists) return exists;
        const c = makeChannel(realtimeTopic);
        channels.push(c);
        return c;
      },
      removeChannel: vi.fn((c: { removed: boolean }) => {
        c.removed = true;
      }),
    };
  }

  return { onAfterSubscribe, makeClient, holder: { client: null as ReturnType<typeof makeClient> | null } };
});

vi.mock("@/lib/supabase/browser", () => ({
  createClient: () => h.holder.client,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

import { ChatRealtime } from "./chat/realtime";
import { FunilRealtime } from "./funil/realtime";

async function flushAsync() {
  // Drain the async IIFEs (getSession + setAuth) scheduled by the effects.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  h.onAfterSubscribe.length = 0;
  h.holder.client = h.makeClient();
});

describe("realtime subscription safety under React Strict Mode", () => {
  it("ChatRealtime never adds postgres_changes after subscribe()", async () => {
    render(
      <StrictMode>
        <ChatRealtime empresaId="e1" />
      </StrictMode>,
    );
    await flushAsync();
    expect(h.onAfterSubscribe).toEqual([]);
  });

  it("FunilRealtime never adds postgres_changes after subscribe()", async () => {
    render(
      <StrictMode>
        <FunilRealtime empresaId="e1" />
      </StrictMode>,
    );
    await flushAsync();
    expect(h.onAfterSubscribe).toEqual([]);
  });
});
