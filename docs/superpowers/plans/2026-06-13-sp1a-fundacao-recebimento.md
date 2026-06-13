# SP1a — Fundação + Recebimento · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax. The **superpowers:supabase** skill activates during DB tasks. **Next.js 16** (`sapatao-rh/AGENTS.md`): `proxy.ts` not middleware; `params`/`cookies()`/`headers()` are async; read `node_modules/next/dist/docs/` before routes/layouts.

**Goal:** Receive WhatsApp candidate messages inside Sapatão RH: a candidate texts the shared number → the message appears in a realtime 3-column chat in ≤3s and the candidate becomes a `candidatos` record. (Read-only thread; send is SP1b, media is SP1c.)

**Architecture:** New multi-tenant tables (`empresa_id` + RLS, SP0 pattern) + the espelho's `on_new_message` trigger and double-dedup indexes. A per-instance webhook route (`/api/whatsapp/webhook/[instanceId]`, always-200, service-role, tolerant parser) runs the inbound pipeline. Supabase Realtime (socket `setAuth` + filtered `postgres_changes` → `router.refresh()`) drives the UI. UAZAPI client handles instance QR connect.

**Tech Stack:** Next.js 16 · React 19 · TypeScript · Supabase (Postgres + Realtime + Storage) · `pg` migration runner · Zod 4 · Vitest 4 · shadcn/Base UI · Tailwind 4.

**Spec:** [docs/superpowers/specs/2026-06-13-sp1a-fundacao-recebimento-design.md](../specs/2026-06-13-sp1a-fundacao-recebimento-design.md)

---

## Conventions
- `npm`/`node` run inside `sapatao-rh/`; `git` from repo root with `sapatao-rh/...` paths.
- Migrations: write `.sql` under `sapatao-rh/supabase/migrations/`, apply with `npm run migrate` (idempotent `pg` runner, tracks `public._migrations`). Verify with a throwaway `pg` script (delete after).
- Tests: `npm test` (Vitest). TDD on business logic: failing test → red → implement → green → commit.
- Reuse SP0 verbatim: RLS helpers `current_empresa_id()`, `current_user_role()`, `is_platform_admin()` (migration 0002 — never redefine); policy shape from `0004_rls_policies.sql`; supabase clients in `lib/supabase/`; `getCurrentProfile`; `rbac`.

## File Structure (created/modified)
```
sapatao-rh/
├── supabase/migrations/0005_whatsapp_tables.sql … 0009_storage.sql
├── supabase/seed.mjs                         # extend: instance row + triagem templates
├── types/database.ts                         # +WhatsappInstance,Candidato,Conversation,Message,MessageTemplate
├── lib/validations/whatsapp.ts               # Zod schemas
├── lib/uazapi/extract.ts                     # tolerant field extractors (TDD)
├── lib/uazapi/phone.ts                       # phone normalize + opt-out regex (TDD)
├── lib/uazapi/webhook-parser.ts              # raw payload → UazapiEvent (TDD)
├── lib/uazapi/client.ts                      # instance lifecycle + webhook register
├── lib/whatsapp/inbound.ts                   # inbound pipeline (TDD, injected admin client)
├── proxy.ts                                  # MODIFY: exclude /api from matcher
├── app/api/whatsapp/webhook/[instanceId]/route.ts
├── app/(app)/chat/page.tsx                   # replace placeholder: 3-col shell (read-only)
├── components/chat/conversation-list.tsx
├── components/chat/message-thread.tsx
├── components/chat/candidate-panel.tsx
├── components/chat/realtime.tsx              # setAuth + subscriptions
├── lib/chat/queries.ts                       # server loaders (list, thread)
├── app/(app)/configuracoes/whatsapp/page.tsx # instance admin (QR)
├── app/(app)/configuracoes/whatsapp/actions.ts
└── lib/auth/rbac.ts                          # MODIFY: add chat + configuracoes/whatsapp nav (already has chat; add whatsapp subroute handling)
```

---

# Phase A — Database, RLS, Realtime, Storage, Types

### Task A1: Migration 0005 — tables
**Files:** Create `sapatao-rh/supabase/migrations/0005_whatsapp_tables.sql`

- [ ] **Step 1:** Write `0005_whatsapp_tables.sql` with the full DDL from spec §3 (0005): `whatsapp_instances`, `candidatos`, `conversations`, `messages`, `message_templates`, `whatsapp_optouts` — including all indexes, the two partial UNIQUE dedup indexes on `messages`, the `unique(empresa_id, telefone)` on candidatos, `unique(empresa_id, candidato_id)` on conversations, `update_updated_at` triggers, and `_empresa_idx` indexes. Use `create table if not exists` / `drop trigger if exists ... create trigger` for idempotency.
- [ ] **Step 2:** Apply: `npm run migrate`. Expected: `apply 0005_whatsapp_tables.sql ... OK`.
- [ ] **Step 3:** Verify with a throwaway `pg` script (`supabase/_v.mjs`, then delete): assert the 6 tables exist and the two partial unique indexes `messages_inbound_dedup`, `messages_outbound_dedup` exist (`select indexname from pg_indexes where tablename='messages'`). Delete `_v.mjs`.
- [ ] **Step 4:** Commit: `git add sapatao-rh/supabase/migrations/0005_whatsapp_tables.sql` → `git commit -m "feat(sp1a): db tables (instances, candidatos, conversations, messages, templates, optouts)"`.

### Task A2: Migration 0006 — on_new_message trigger
**Files:** Create `sapatao-rh/supabase/migrations/0006_on_new_message.sql`

- [ ] **Step 1:** Write `0006_on_new_message.sql` exactly as spec §3 (0006): `on_new_message()` (`security definer set search_path = public`) + `messages_after_insert` trigger. Use `create or replace function` and `drop trigger if exists ... create trigger`.
- [ ] **Step 2:** Apply `npm run migrate`.
- [ ] **Step 3:** Verify (throwaway script): insert a fake empresa-scoped candidato+conversation+message via service role; assert `conversations.last_message_preview`/`last_message_at`/`unread_count` updated; clean up the rows. Delete script.
- [ ] **Step 4:** Commit `"feat(sp1a): on_new_message trigger (preview/unread + realtime fan-out)"`.

### Task A3: Migration 0007 — RLS + token protection + safe view
**Files:** Create `sapatao-rh/supabase/migrations/0007_whatsapp_rls.sql`

- [ ] **Step 1:** Write `0007_whatsapp_rls.sql`:
  - `alter table ... enable row level security` for all 6 tables.
  - For `candidatos`, `conversations`, `messages`, `message_templates`, `whatsapp_optouts`: `_select` (`using (empresa_id = public.current_empresa_id() or public.is_platform_admin())`) and `_write` for-all (`using/with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())`). Use `drop policy if exists ... create policy`.
  - For `whatsapp_instances`: `_select` same; `_write` admin-only (`current_user_role() = 'admin'`).
  - Token protection:
    ```sql
    revoke select on public.whatsapp_instances from anon, authenticated;
    grant select (id, empresa_id, nome, uazapi_instance_id, webhook_secret, status,
                  phone_number, connected_at, last_seen_at, created_at, updated_at)
      on public.whatsapp_instances to authenticated;
    drop view if exists public.whatsapp_instances_safe;
    create view public.whatsapp_instances_safe with (security_invoker = true) as
      select id, empresa_id, nome, uazapi_instance_id, status, phone_number,
             connected_at, last_seen_at, created_at, updated_at
      from public.whatsapp_instances;
    ```
- [ ] **Step 2:** Apply `npm run migrate`.
- [ ] **Step 3:** Verify (throwaway script using the **anon** client + the seeded admin login from SP0): after `signInWithPassword`, `select uazapi_token from whatsapp_instances` must ERROR (permission denied on column) while `select * from whatsapp_instances_safe` returns the row. Assert both. Delete script.
- [ ] **Step 4:** Commit `"feat(sp1a): rls + token column protection + safe view"`.

### Task A4: Migration 0008 — realtime publication
**Files:** Create `sapatao-rh/supabase/migrations/0008_realtime.sql`
- [ ] **Step 1:** Write: `alter publication supabase_realtime add table public.conversations;` and `... public.messages;`. (Wrap each in a `do $$ begin ... exception when duplicate_object then null; end $$;` so re-runs are idempotent.)
- [ ] **Step 2:** Apply `npm run migrate`.
- [ ] **Step 3:** Verify: `select tablename from pg_publication_tables where pubname='supabase_realtime' and tablename in ('messages','conversations')` returns both.
- [ ] **Step 4:** Commit `"feat(sp1a): realtime publication for conversations + messages"`.

### Task A5: Migration 0009 — storage buckets + RLS
**Files:** Create `sapatao-rh/supabase/migrations/0009_storage.sql`
- [ ] **Step 1:** Write: insert buckets `whatsapp-media` and `curriculos` (private) into `storage.buckets` (`on conflict (id) do nothing`); storage.objects policies scoped by `(storage.foldername(name))[1] = public.current_empresa_id()::text` for select; insert for admin/rh; `drop policy if exists` first. (Service role bypasses.)
- [ ] **Step 2:** Apply `npm run migrate`.
- [ ] **Step 3:** Verify: `select id from storage.buckets where id in ('whatsapp-media','curriculos')` returns both.
- [ ] **Step 4:** Commit `"feat(sp1a): private storage buckets + empresa-scoped RLS"`.

### Task A6: Seed extension
**Files:** Modify `sapatao-rh/supabase/seed.mjs`
- [ ] **Step 1:** After the admin profile, add idempotent inserts: one `whatsapp_instances` row for the empresa (`nome:'WhatsApp RH'`, status `desconectado`, no token yet) if none exists; and the triagem `message_templates` (categoria `filtro_inicial`): "Idade ≥18", "CEP", "Veículo próprio", "Vaga de interesse", "Pede currículo" — each `if not exists by (empresa_id, nome)`.
- [ ] **Step 2:** Run `npm run seed`. Expected: logs the new rows once, "já existe" on re-run.
- [ ] **Step 3:** Commit `"feat(sp1a): seed whatsapp instance + triagem templates"`.

### Task A7: DB types
**Files:** Modify `sapatao-rh/types/database.ts`
- [ ] **Step 1:** Add interfaces `WhatsappInstance`, `Candidato`, `Conversation`, `Message`, `MessageTemplate`, `WhatsappOptout` (fields matching the DDL; reuse the `Timestamps` helper) and add their `Tables` entries (`Row`/`Insert`/`Update`) following the existing shape. Export a `MessageStatus`/`MessageTipo`/`Direction` union type as needed.
- [ ] **Step 2:** `npx tsc --noEmit` → exit 0.
- [ ] **Step 3:** Commit `"feat(sp1a): db types for whatsapp/candidato/conversation/message"`.

---

# Phase B — UAZAPI integration libs (TDD)

### Task B1: Tolerant extractors
**Files:** Create `sapatao-rh/lib/uazapi/extract.test.ts` then `extract.ts`

- [ ] **Step 1: Failing test** — `extract.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { extractMessageId, extractQr, normalizeStatus } from "./extract";

describe("extractMessageId", () => {
  it("prefers messageid, falls back through id/key.id/message.key.id", () => {
    expect(extractMessageId({ messageid: "m1" })).toBe("m1");
    expect(extractMessageId({ id: "owner:m2" })).toBe("owner:m2");
    expect(extractMessageId({ key: { id: "m3" } })).toBe("m3");
    expect(extractMessageId({ message: { key: { id: "m4" } } })).toBe("m4");
    expect(extractMessageId({})).toBeNull();
  });
});
describe("extractQr", () => {
  it("tries qrcode/qrCode/base64 across shapes", () => {
    expect(extractQr({ instance: { qrcode: "Q1" } })).toBe("Q1");
    expect(extractQr({ qrcode: "Q2" })).toBe("Q2");
    expect(extractQr({ qrCode: "Q3" })).toBe("Q3");
    expect(extractQr({ base64: "Q4" })).toBe("Q4");
    expect(extractQr({})).toBeNull();
  });
});
describe("normalizeStatus", () => {
  it("maps Title-Case + variants case-insensitively", () => {
    expect(normalizeStatus("Read")).toBe("read");
    expect(normalizeStatus("DELIVERY_ACK")).toBe("delivered");
    expect(normalizeStatus("server_ack")).toBe("sent");
    expect(normalizeStatus("PLAYED")).toBe("read");
    expect(normalizeStatus("ERROR")).toBe("failed");
    expect(normalizeStatus("Deleted")).toBe("deleted");
    expect(normalizeStatus("weird")).toBeNull();
  });
});
```
- [ ] **Step 2:** Run `npm test -- extract` → FAIL (no module).
- [ ] **Step 3: Implement** `extract.ts`:
```ts
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
  pending: "sent", server_ack: "sent", sent: "sent",
  delivery_ack: "delivered", delivered: "delivered",
  read: "read", played: "read",
  error: "failed", failed: "failed", canceled: "failed",
  deleted: "deleted",
};
export function normalizeStatus(raw: unknown): "sent" | "delivered" | "read" | "failed" | "deleted" | null {
  if (typeof raw !== "string") return null;
  return STATUS_MAP[raw.trim().toLowerCase()] ?? null;
}
```
- [ ] **Step 4:** `npm test -- extract` → PASS.
- [ ] **Step 5:** Commit `"feat(sp1a): tolerant uazapi field extractors [tdd]"`.

### Task B2: Phone normalize + opt-out
**Files:** Create `sapatao-rh/lib/uazapi/phone.test.ts` then `phone.ts`

- [ ] **Step 1: Failing test**:
```ts
import { describe, it, expect } from "vitest";
import { normalizePhone, isOptOut } from "./phone";

describe("normalizePhone", () => {
  it("keeps digits only, strips JID suffix and +", () => {
    expect(normalizePhone("+55 (51) 99999-9999")).toBe("5551999999999");
    expect(normalizePhone("5551999999999@s.whatsapp.net")).toBe("5551999999999");
    expect(normalizePhone("5551999999999:12@s.whatsapp.net")).toBe("5551999999999");
  });
  it("returns empty for junk", () => {
    expect(normalizePhone("abc")).toBe("");
  });
});
describe("isOptOut", () => {
  it("detects PARAR/SAIR/STOP case-insensitive as a standalone word", () => {
    expect(isOptOut("PARAR")).toBe(true);
    expect(isOptOut("quero sair")).toBe(true);
    expect(isOptOut("stop")).toBe(true);
    expect(isOptOut("não vou parar de trabalhar")).toBe(false);
    expect(isOptOut("tenho experiência")).toBe(false);
  });
});
```
- [ ] **Step 2:** Run `npm test -- phone` → FAIL.
- [ ] **Step 3: Implement** `phone.ts`:
```ts
export function normalizePhone(raw: string): string {
  const beforeColon = raw.split("@")[0].split(":")[0];
  return beforeColon.replace(/\D/g, "");
}
const OPTOUT = /(^|\s)(parar|sair|stop|cancelar)(\s|$|\.|!)/i;
export function isOptOut(text: string | null | undefined): boolean {
  if (!text) return false;
  return OPTOUT.test(text.trim());
}
```
> Note: `isOptOut("não vou parar de trabalhar")` contains "parar" as a standalone word → this WOULD match. Adjust the test fixture if a stricter rule is wanted; for SP1a keep the simple standalone-word rule and use the test `"continuo trabalhando"` instead for the negative case. (Implementer: align test + impl; the rule is "standalone opt-out keyword".)
- [ ] **Step 4:** `npm test -- phone` → PASS (fix the one negative fixture to a phrase without the keyword, e.g. `"tenho experiência"` and `"continuo disponível"`).
- [ ] **Step 5:** Commit `"feat(sp1a): phone normalize + opt-out detection [tdd]"`.

### Task B3: Webhook parser
**Files:** Create `sapatao-rh/lib/uazapi/webhook-parser.test.ts` then `webhook-parser.ts`

- [ ] **Step 1: Failing test** (representative UAZAPI v2 shapes per the espelho §5.2 — the implementer must keep field paths aligned with the espelho and refine against the live gateway):
```ts
import { describe, it, expect } from "vitest";
import { parseUazapiEvent } from "./webhook-parser";

const inbound = {
  event: "messages",
  instance: "inst-1",
  message: {
    messageid: "M1", fromMe: false, messageType: "text",
    text: "Olá, tenho interesse na vaga",
    chatid: "5551999999999@s.whatsapp.net",
    senderName: "Recrutador X", // must be IGNORED for contactName
    chat: { wa_name: "Maria Candidata" },
    wasSentByApi: false,
  },
};

describe("parseUazapiEvent", () => {
  it("parses an inbound text message, taking contactName from chat (not senderName)", () => {
    const e = parseUazapiEvent(inbound);
    expect(e.kind).toBe("message");
    if (e.kind !== "message") throw new Error("kind");
    expect(e.direction).toBe("inbound");
    expect(e.providerMessageId).toBe("M1");
    expect(e.phone).toBe("5551999999999");
    expect(e.content).toBe("Olá, tenho interesse na vaga");
    expect(e.contactName).toBe("Maria Candidata");
    expect(e.wasSentByApi).toBe(false);
  });
  it("flags outbound echo (fromMe + wasSentByApi)", () => {
    const e = parseUazapiEvent({ event: "messages", instance: "i", message: { messageid: "M2", fromMe: true, wasSentByApi: true, chatid: "5551@s.whatsapp.net", text: "oi", chat: { wa_name: "X" } } });
    if (e.kind !== "message") throw new Error("kind");
    expect(e.direction).toBe("outbound");
    expect(e.wasSentByApi).toBe(true);
  });
  it("parses a status update", () => {
    const e = parseUazapiEvent({ event: "messages_update", messageid: "M1", status: "Read" });
    expect(e.kind).toBe("status");
    if (e.kind !== "status") throw new Error("kind");
    expect(e.providerMessageId).toBe("M1");
    expect(e.status).toBe("read");
  });
  it("parses a connection event", () => {
    const e = parseUazapiEvent({ event: "connection", instance: "i", state: "open" });
    expect(e.kind).toBe("connection");
    if (e.kind !== "connection") throw new Error("kind");
    expect(e.state).toBe("connected");
  });
  it("returns ignore for unknown/missing-id", () => {
    expect(parseUazapiEvent({ event: "messages", message: { fromMe: false } }).kind).toBe("ignore");
    expect(parseUazapiEvent({ event: "presence" }).kind).toBe("ignore");
  });
});
```
- [ ] **Step 2:** Run `npm test -- webhook-parser` → FAIL.
- [ ] **Step 3: Implement** `webhook-parser.ts`:
```ts
import { extractMessageId, normalizeStatus } from "./extract";
import { normalizePhone } from "./phone";

export type UazapiEvent =
  | {
      kind: "message"; instanceId: string | null; direction: "inbound" | "outbound";
      messageType: string; content: string; phone: string; providerMessageId: string;
      contactName: string | null; senderName: string | null; wasSentByApi: boolean;
      mediaMime: string | null;
    }
  | { kind: "status"; providerMessageId: string; status: "sent" | "delivered" | "read" | "failed" | "deleted" }
  | { kind: "connection"; instanceId: string | null; state: "connected" | "connecting" | "disconnected" }
  | { kind: "ignore" };

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

function contactNameFromChat(chat: Obj): string | null {
  return str(chat["wa_name"]) ?? str(chat["wa_contactName"]) ?? str(chat["name"]) ?? null;
}

export function parseUazapiEvent(raw: unknown): UazapiEvent {
  const p = asObj(raw);
  const event = str(p["event"]);
  const instanceId = str(p["instance"]) ?? str(p["instanceName"]) ?? str(p["instance_id"]);

  if (event === "connection") {
    const s = (str(p["state"]) ?? str(p["status"]) ?? "").toLowerCase();
    const state = s === "open" || s === "connected" ? "connected" : s === "connecting" || s === "syncing" ? "connecting" : "disconnected";
    return { kind: "connection", instanceId, state };
  }
  if (event === "messages_update" || (p["status"] && p["messageid"] && !p["message"])) {
    const id = extractMessageId(p);
    const status = normalizeStatus(p["status"]);
    if (id && status) return { kind: "status", providerMessageId: id, status };
    return { kind: "ignore" };
  }
  if (event === "messages") {
    const m = asObj(p["message"]);
    const id = extractMessageId(m);
    if (!id) return { kind: "ignore" };
    const chat = asObj(m["chat"]);
    const fromMe = m["fromMe"] === true;
    return {
      kind: "message",
      instanceId,
      direction: fromMe ? "outbound" : "inbound",
      messageType: str(m["messageType"]) ?? "text",
      content: str(m["text"]) ?? str(m["conteudo"]) ?? str(m["body"]) ?? "",
      phone: normalizePhone(str(m["chatid"]) ?? str(m["phone"]) ?? ""),
      providerMessageId: id,
      contactName: contactNameFromChat(chat),
      senderName: str(m["senderName"]),
      wasSentByApi: m["wasSentByApi"] === true,
      mediaMime: str(m["mimetype"]) ?? str(m["mime"]),
    };
  }
  return { kind: "ignore" };
}
```
- [ ] **Step 4:** `npm test -- webhook-parser` → PASS.
- [ ] **Step 5:** Commit `"feat(sp1a): uazapi webhook parser (tolerant, contactName-from-chat) [tdd]"`.

### Task B4: Validations + UAZAPI client
**Files:** Create `sapatao-rh/lib/validations/whatsapp.ts`, `sapatao-rh/lib/uazapi/client.ts`
- [ ] **Step 1:** `lib/validations/whatsapp.ts` — Zod 4 schemas: `webhookParamsSchema` (`instanceId: z.string().min(1)`), and a small `connectInputSchema` (`{ phone?: z.string().optional() }`). Mirror `lib/validations/usuarios.ts` style.
- [ ] **Step 2:** `lib/uazapi/client.ts` — a thin fetch wrapper around `process.env.UAZAPI_API_URL`. Functions: `createInstance(adminToken, name)`, `connectInstance(token, phone?)` (returns `{ qr: extractQr(resp) | null }`), `instanceStatus(token)`, `disconnectInstance(token)`, `registerWebhook(token, url)`. Each does one `fetch` with the right header (`admintoken` or `token`, NO Bearer), parses JSON, uses `extract.ts` for tolerant fields, and throws a typed `UazapiError` on non-2xx. **No retry, no custom timeout** (espelho rule).
- [ ] **Step 3:** Typecheck `npx tsc --noEmit` → 0.
- [ ] **Step 4:** Commit `"feat(sp1a): whatsapp validations + uazapi client"`.

---

# Phase C — Webhook + inbound pipeline

### Task C1: Fix the proxy matcher (CRITICAL)
**Files:** Modify `sapatao-rh/proxy.ts`
- [ ] **Step 1:** Change the matcher to also exclude `api`:
```ts
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```
> The webhook (`/api/whatsapp/webhook/...`) and `/api/usuarios` do their own auth; the proxy must not redirect them to /login.
- [ ] **Step 2:** Build: `npm run build` → success.
- [ ] **Step 3:** Commit `"fix(sp1a): exclude /api from proxy matcher (webhook + api routes)"`.

### Task C2: Inbound pipeline (TDD, injected admin client)
**Files:** Create `sapatao-rh/lib/whatsapp/inbound.test.ts` then `inbound.ts`

- [ ] **Step 1: Failing test** — model the admin client as an injectable `DbLike` with the methods the pipeline uses (mirror SP0's `create-usuario.ts` injection pattern). Test: a fresh inbound message creates candidato (nome from contactName) + conversation + message; a second event with the same `uazapi_msg_id` is a no-op (dedup); an outbound echo (`wasSentByApi`) is skipped; an opt-out message inserts into `whatsapp_optouts`. Use `vi.fn()` mocks returning `{ data, error }` shapes.
```ts
import { describe, it, expect, vi } from "vitest";
import { handleInboundMessage, type DbLike } from "./inbound";
import type { UazapiEvent } from "@/lib/uazapi/webhook-parser";

const ctx = { empresa_id: "emp-1", instance_id: "inst-1" };
const msg = (over = {}): Extract<UazapiEvent, { kind: "message" }> => ({
  kind: "message", instanceId: "uazapi-1", direction: "inbound", messageType: "text",
  content: "Olá", phone: "5551999999999", providerMessageId: "M1",
  contactName: "Maria Candidata", senderName: null, wasSentByApi: false, mediaMime: null, ...over,
});

// makeDb returns a chainable mock; see implementation note for the exact shape the pipeline calls.
```
*(Implementer: define `DbLike` to expose exactly the calls `inbound.ts` makes — e.g. `upsertCandidato`, `upsertConversation`, `insertMessage`, `insertOptout` as thin methods — OR model the supabase `.from().upsert()/.insert()/.select()` chain. Prefer small explicit methods on `DbLike` so the test is readable, and have the route adapt the real supabase admin client to that interface. Cover: new candidato, dedup no-op, echo skip, opt-out.)*
- [ ] **Step 2:** Run `npm test -- inbound` → FAIL.
- [ ] **Step 3: Implement** `inbound.ts`: `handleInboundMessage(event, ctx, db)` →
  1. if `event.direction==='outbound' && event.wasSentByApi` return `{skipped:'echo'}`.
  2. if no `providerMessageId` return `{skipped:'no-id'}`.
  3. `db.upsertCandidato({ empresa_id, telefone: phone, nome: contactName ?? 'Desconhecido' })` (on conflict `(empresa_id, telefone)` do nothing/update nome only if currently 'Desconhecido') → candidatoId.
  4. `db.upsertConversation({ empresa_id, candidato_id, instance_id })` → conversationId.
  5. `db.insertMessage({ empresa_id, conversation_id, uazapi_msg_id: providerMessageId, direction:'inbound', tipo: messageType, conteudo: content })`; on unique violation (dedup) treat as no-op success.
  6. if `isOptOut(content)` → `db.insertOptout({ empresa_id, telefone })`.
  Return `{ ok:true, candidatoId, conversationId }`.
- [ ] **Step 4:** `npm test -- inbound` → PASS.
- [ ] **Step 5:** Commit `"feat(sp1a): inbound message pipeline (upsert + dedup + opt-out) [tdd]"`.

### Task C3: Webhook route
**Files:** Create `sapatao-rh/app/api/whatsapp/webhook/[instanceId]/route.ts`
- [ ] **Step 1:** Implement `POST(request, ctx)`:
  - `const { instanceId } = await ctx.params;` (Next 16 — params is a Promise; type via `RouteContext` or `{ params: Promise<{ instanceId: string }> }`).
  - Wrap everything in try/catch; **always** `return NextResponse.json({ ok: true })` (200), logging errors.
  - `const admin = createAdminClient();` → `select` the instance from `whatsapp_instances` by `uazapi_instance_id = instanceId` (token + empresa_id + webhook_secret). Not found → 200 `{ok:true}` silently.
  - Validate the `webhook_secret` (compare a `?secret=` query param or the body token to the stored value); mismatch → 200 silently.
  - `const event = parseUazapiEvent(await request.json())`.
  - If `event.kind==='message'` and inbound: build a `DbLike` adapter over `admin` (service role) and call `handleInboundMessage(event, { empresa_id, instance_id }, db)`. If media type, record the message with its `tipo` (download deferred to SP1c).
  - If `event.kind==='connection'`: update `whatsapp_instances.status`/`last_seen_at`.
  - (status events handled in SP1b.)
- [ ] **Step 2:** Build `npm run build` → success.
- [ ] **Step 3:** Commit `"feat(sp1a): webhook route (per-instance, always-200, inbound pipeline)"`.

### Task C4: Webhook simulation E2E
**Files:** none (throwaway script `supabase/_sim.mjs`, deleted after)
- [ ] **Step 1:** Write a script that POSTs a fake inbound UAZAPI payload to `http://localhost:3000/api/whatsapp/webhook/<seeded-instance-uazapi-id-or-path>` (first set the seeded instance's `uazapi_instance_id` + `webhook_secret` to known values via service role). Start `npm run dev` (or `start` after build) in the background.
- [ ] **Step 2:** Assert via service-role `pg`/supabase-js: a `candidatos` row exists with nome "Maria Candidata"; a `conversations` row; a `messages` row with the providerMessageId. POST the SAME payload again → still exactly one message (dedup). POST an echo (`wasSentByApi:true`) → no new message. POST "PARAR" → `whatsapp_optouts` row.
- [ ] **Step 3:** Tear down server; delete `_sim.mjs`. Record pass/fail. (No commit — verification only.)

---

# Phase D — Realtime + Chat UI (read-only)

### Task D1: Chat server loaders
**Files:** Create `sapatao-rh/lib/chat/queries.ts`
- [ ] **Step 1:** `listConversations()` (server): `createClient()` → select conversations joined with candidato (nome, avatar_url, tags) `order by last_message_at desc nulls last`. `loadThread(conversationId)`: select last 61 messages `order by created_at desc limit 61` → reverse → `{ messages, hasMore }`. `getEmpresaId()` from `getCurrentProfile()`. All RLS-scoped automatically.
- [ ] **Step 2:** `npx tsc --noEmit` → 0.
- [ ] **Step 3:** Commit `"feat(sp1a): chat server loaders (conversations + thread)"`.

### Task D2: Realtime component
**Files:** Create `sapatao-rh/components/chat/realtime.tsx`
- [ ] **Step 1:** Client component `<ChatRealtime empresaId={...} />`:
```tsx
"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function ChatRealtime({ empresaId }: { empresaId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: else RLS filters all events
      channel = supabase
        .channel("chat")
        .on("postgres_changes", { event: "*", schema: "public", table: "messages", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `empresa_id=eq.${empresaId}` }, () => router.refresh())
        .subscribe();
    })();
    return () => { if (channel) supabase.removeChannel(channel); };
  }, [empresaId, router]);
  return null;
}
```
- [ ] **Step 2:** `npx tsc --noEmit` → 0.
- [ ] **Step 3:** Commit `"feat(sp1a): realtime chat subscription (setAuth + filtered)"`.

### Task D3: Chat 3-column UI (read-only)
**Files:** Create `components/chat/conversation-list.tsx`, `message-thread.tsx`, `candidate-panel.tsx`; replace `app/(app)/chat/page.tsx`
- [ ] **Step 1:** `app/(app)/chat/page.tsx` (server, `export const dynamic = "force-dynamic"`): load profile + conversations; read `?c=<id>` from `searchParams` (Next 16: `searchParams` is a Promise → await) to pick the active conversation; load its thread; render the 3-column layout + `<ChatRealtime empresaId>`. The shell must be full-height (`h-full overflow-hidden`) — see Task D4.
- [ ] **Step 2:** `conversation-list.tsx` (client): receives the full list; client-side search (normalized lowercase + strip accents over nome/telefone/preview) + filter tabs; each card links to `/chat?c=<id>`; unread badge (99+ cap); relative time via one shared 60s clock. Follow SP0 Base UI patterns (read `components/ui/*` for APIs).
- [ ] **Step 3:** `message-thread.tsx` (client, `key={conversationId}`): render bubbles (inbound left / outbound right) from server-provided messages; a **disabled** composer textarea with placeholder "Envio chega na próxima etapa (SP1b)". (Infinite scroll can be a follow-up; SP1a shows the last ~60.)
- [ ] **Step 4:** `candidate-panel.tsx`: candidate basics (nome, telefone, vaga_interesse, etapa, tags, notas_internas), score IA placeholder.
- [ ] **Step 5:** `npm run build` → success; route `/chat` compiles.
- [ ] **Step 6:** Commit `"feat(sp1a): read-only 3-column chat ui + realtime wiring"`.

### Task D4: Full-height layout fix
**Files:** Modify `app/(app)/layout.tsx` (and/or chat page wrapper)
- [ ] **Step 1:** Resolve the `p-6` tension cleanly: e.g. wrap `{children}` in `<main className="flex-1 overflow-auto">` without padding and let each page add its own padding, OR give the chat page a `h-full` zero-padding container. Do NOT use negative margins. Confirm other pages (dashboard placeholder etc.) still look fine.
- [ ] **Step 2:** `npm run build` → success; `npm test` still green.
- [ ] **Step 3:** Commit `"fix(sp1a): full-height chat layout without padding hacks"`.

---

# Phase E — Instance admin UI (QR connect)

### Task E1: Env config
**Files:** Modify `sapatao-rh/.env.local` (untracked) + `.env.example`
- [ ] **Step 1:** Add to `.env.example`: `UAZAPI_API_URL=https://your-uazapi-host`, `UAZAPI_ADMIN_TOKEN=your-admin-token`. Add the real values to `.env.local` **when the user provides them** (leave blank/placeholder otherwise; the UI handles "not configured").
- [ ] **Step 2:** Commit only `.env.example`: `"chore(sp1a): uazapi env example"`.

### Task E2: Instance server actions
**Files:** Create `app/(app)/configuracoes/whatsapp/actions.ts`
- [ ] **Step 1:** `"use server"` actions guarded by `getCurrentProfile()` (admin only): `conectar()` → read/create the empresa's instance (service role), call `client.createInstance`/`connectInstance` with `UAZAPI_ADMIN_TOKEN`, store the returned token + `uazapi_instance_id`, `registerWebhook(token, ${origin}/api/whatsapp/webhook/${uazapi_instance_id}?secret=${webhook_secret})`, return `{ qr }`. `statusInstancia()` → poll. `desconectar()`. All token handling server-side only. If `UAZAPI_API_URL`/`ADMIN_TOKEN` missing → return `{ error: 'uazapi_nao_configurada' }`.
- [ ] **Step 2:** `npx tsc --noEmit` → 0.
- [ ] **Step 3:** Commit `"feat(sp1a): instance connect/status/disconnect server actions"`.

### Task E3: Instance admin page + nav
**Files:** Create `app/(app)/configuracoes/whatsapp/page.tsx`; modify `lib/auth/rbac.ts` if needed
- [ ] **Step 1:** Page (server, admin guard via `canAccessPath`/profile): read `whatsapp_instances_safe`; client subcomponent shows status, a "Conectar" button that calls `conectar()` and renders the returned QR (`<img src={qr}>`) with status polling every 5s while `qr_pendente`/`connecting`; "Desconectar" button. Show "UAZAPI não configurada" state if the action returns that error.
- [ ] **Step 2:** Ensure `canAccessPath` treats `/configuracoes/whatsapp` as admin-only (it's under `/configuracoes`, already admin-gated by the `configuracoes` nav item — confirm the section guard covers it). Add a sub-nav link if Configurações has a submenu; otherwise the page is reachable directly.
- [ ] **Step 3:** `npm run build` → success.
- [ ] **Step 4:** Commit `"feat(sp1a): configuracoes > whatsapp (instance QR connect, admin)"`.

---

# Phase F — Verify & finish

### Task F1: Quality gate
- [ ] **Step 1:** `npm run test:cov` — all pass; business logic (`extract`, `phone`, `webhook-parser`, `inbound`) ≥60%.
- [ ] **Step 2:** `npm run lint`, `npx tsc --noEmit`, `npm run build` — all clean.
- [ ] **Step 3:** Commit any fixes `"chore(sp1a): quality gate"`.

### Task F2: E2E verification
- [ ] **Step 1:** Re-run the webhook simulation (Task C4) against the running server; confirm candidate/conversation/message creation, dedup, echo-skip, opt-out, and that an inserted message triggers a realtime `router.refresh()` (observe the chat list reorder — can be checked by a second simulated message updating `last_message_at`).
- [ ] **Step 2:** Document results vs acceptance criteria (spec §11). Note the live-QR + real-WhatsApp check as pending UAZAPI credentials (user-run).

### Task F3: Final review + finish
- [ ] **Step 1:** Dispatch a final code-review subagent over the whole SP1a diff (tenant isolation on the new tables, token protection holds, webhook always-200 + dedup correctness, realtime setAuth, no service-role leak to client).
- [ ] **Step 2:** Use **superpowers:finishing-a-development-branch** (push `feat/sp1a-recebimento`, open PR stacked on SP0 or onto main once SP0 is merged).

---

## Self-Review (author checklist — completed)

**Spec coverage:** §3 data model → A1–A5; seed → A6; types → A7; §4 UAZAPI client/extractor/parser → B1–B4; §5 webhook + proxy fix + pipeline → C1–C4; §6 instance UI → E1–E3; §7 realtime + chat UI → D1–D4; §9 tests → B1–B3, C2 (TDD) + F1; §11 acceptance → C4, F1–F2.

**Placeholder scan:** code-complete for the TDD-core tasks (extract, phone, webhook-parser) and key files (route, realtime, proxy). The inbound-pipeline `DbLike` shape and the UI components are specified by responsibility + interface + SP0 reference rather than full literal code (large, Base-UI-adaptive) — implementers follow the spec + SP0 patterns; this is a deliberate altitude choice for the UI, not a gap. The opt-out test fixture note (B2) flags a real impl/test alignment to make.

**Type consistency:** `UazapiEvent` union defined in B3 is consumed by C2/C3; `normalizeStatus`/`extractMessageId`/`extractQr` from B1 used in B3/B4; `normalizePhone`/`isOptOut` from B2 used in B3/C2; `DbLike` injection mirrors SP0's `create-usuario.ts`.

---

**Fim — Plano SP1a v1.0**
