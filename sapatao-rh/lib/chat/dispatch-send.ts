/**
 * Shared optimistic-send dispatch used by the composer AND the retry action.
 * The send-queue worker marks a bubble 'failed' ONLY when the dispatch THROWS;
 * `fetch` does not throw on 4xx/5xx, so we throw on any HTTP error — otherwise a
 * failed send (e.g. no UAZAPI -> 502) would render as 'sent'. Keep this single
 * source of truth so the two call sites can't drift.
 */
export async function dispatchSend(payload: {
  clientMessageId: string;
  conversationId: string;
  texto: string;
}): Promise<{ ok: true }> {
  const res = await fetch("/api/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`send failed: ${res.status}`);
  return { ok: true };
}

/**
 * Dispatch for media sends. Posts to /api/whatsapp/send-media and THROWS on
 * any HTTP error so the queue worker marks the item 'failed'.
 */
export async function dispatchSendMedia(payload: {
  clientMessageId: string;
  conversationId: string;
  fileBase64: string;
  mime: string;
  fileName?: string;
  caption?: string;
}): Promise<{ ok: true }> {
  const res = await fetch("/api/whatsapp/send-media", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`send-media failed: ${res.status}`);
  return { ok: true };
}
