type Obj = Record<string, unknown>;
const get = (o: unknown, path: string[]): unknown =>
  path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Obj)[k] : undefined), o);
const str = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

export function extractMessageId(payload: unknown): string | null {
  return (
    str(get(payload, ["messageid"])) ??
    str(get(payload, ["id"])) ??
    str(get(payload, ["key", "id"])) ??
    str(get(payload, ["message", "key", "id"])) ??
    null
  );
}

export function extractQr(payload: unknown): string | null {
  return (
    str(get(payload, ["instance", "qrcode"])) ??
    str(get(payload, ["qrcode"])) ??
    str(get(payload, ["qrCode"])) ??
    str(get(payload, ["base64"])) ??
    str(get(payload, ["instance", "base64"])) ??
    null
  );
}

const STATUS_MAP: Record<string, "sent" | "delivered" | "read" | "failed" | "deleted"> = {
  pending: "sent",
  server_ack: "sent",
  sent: "sent",
  delivery_ack: "delivered",
  delivered: "delivered",
  read: "read",
  played: "read",
  error: "failed",
  failed: "failed",
  canceled: "failed",
  deleted: "deleted",
};

export function normalizeStatus(
  raw: unknown,
): "sent" | "delivered" | "read" | "failed" | "deleted" | null {
  if (typeof raw !== "string") return null;
  return STATUS_MAP[raw.trim().toLowerCase()] ?? null;
}
