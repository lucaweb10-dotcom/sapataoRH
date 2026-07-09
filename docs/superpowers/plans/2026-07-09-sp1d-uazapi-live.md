# SP1d — UAZAPI ao vivo + Credenciais na tela · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Central de Atendimento operando contra o gateway UAZAPI real: credenciais editadas em Configurações>WhatsApp (banco, por empresa), client corrigido conforme a spec OpenAPI oficial, QR com refresh, webhook do túnel registrável com 1 clique, painel de diagnóstico de eventos brutos e prova E2E via gateway falso.

**Architecture:** Credenciais ficam em colunas novas de `whatsapp_instances` (service-role only, fallback env). O client `lib/uazapi/client.ts` passa a receber `baseUrl` explícito (resolvido por `lib/uazapi/config.ts`). O webhook route grava cada evento bruto em `whatsapp_webhook_events` (retenção 50/empresa via função SQL). A UI ganha 3 blocos: Credenciais, Conexão (QR refresh) e Webhook & Diagnóstico.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres+RLS, service role), Zod v4, vitest, TypeScript.

**Spec:** `docs/superpowers/specs/2026-07-09-sp1d-uazapi-live-design.md`
**Referência de contrato:** `Uazapi docs/uazapi-openapi-spec.yaml` (endpoints/headers/payloads citados nas tasks já foram validados contra ela).

## Global Constraints

- App fica em `sapatao-rh/` — TODO comando npm/node começa com `Set-Location` absoluto para `...\Estação Sapatão - RH\sapatao-rh` (o cwd do PowerShell reseta).
- Migrations via `npm run migrate` (runner próprio), arquivo novo = `supabase/migrations/0017_uazapi_credenciais.sql`. NUNCA usar Supabase CLI para migrar.
- `types/database.ts`: Row types são **type alias** (não interface) e cada tabela tem `Relationships: []`; RPCs customizados são chamados com cast `(admin as any).rpc(...)` (Functions=Record<string,never> — não adicionar tipo lá).
- Zod v4 (`z.uuid()`, `z.url()` diretos). Next 16: `params`/`headers()` são async.
- Tokens UAZAPI NUNCA chegam ao browser: colunas novas ficam FORA da view `whatsapp_instances_safe` e FORA do grant por coluna (o grant da 0007 é lista explícita — não tocar nele já basta).
- Suíte inteira precisa terminar verde: `npm run test` (190 testes hoje + os novos).
- Commits pequenos por task, mensagens em pt-BR estilo `feat(sp1d): ...`.

---

### Task 1: Migration 0017 — credenciais + tabela de eventos

**Files:**
- Create: `sapatao-rh/supabase/migrations/0017_uazapi_credenciais.sql`
- Modify: `sapatao-rh/types/database.ts` (WhatsappInstance ~L50-61; Tables ~L239)

**Interfaces:**
- Produces (colunas): `whatsapp_instances.uazapi_base_url text`, `.uazapi_admin_token text`, `.webhook_public_url text`.
- Produces (tabela): `whatsapp_webhook_events(id, empresa_id, event, parsed_kind, payload, created_at)`.
- Produces (função SQL): `prune_whatsapp_webhook_events(p_empresa_id uuid, p_keep integer default 50)`.
- Produces (tipos TS): `WhatsappInstance` com os 3 campos novos (`string | null`); type `WhatsappWebhookEvent`; entrada `whatsapp_webhook_events` em `Database.public.Tables`.

- [ ] **Step 1: Escrever a migration**

```sql
-- 0017: SP1d — credenciais UAZAPI por empresa + log de eventos de webhook.

-- 1) Credenciais na instância (SENSÍVEL: fora da view safe e do grant por coluna da 0007).
alter table public.whatsapp_instances
  add column if not exists uazapi_base_url text,
  add column if not exists uazapi_admin_token text,
  add column if not exists webhook_public_url text;

comment on column public.whatsapp_instances.uazapi_admin_token is
  'SENSIVEL: admin token UAZAPI. Nunca exposto ao browser (sem grant, fora da view safe).';

-- 2) Log de eventos brutos do webhook (diagnóstico; retenção 50/empresa via prune).
create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  event text,
  parsed_kind text not null default 'ignore',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_empresa_recentes
  on public.whatsapp_webhook_events (empresa_id, created_at desc);

alter table public.whatsapp_webhook_events enable row level security;

-- SELECT só admin do tenant (ou platform admin). Sem policy de INSERT/UPDATE/DELETE
-- para authenticated: escrita é exclusiva do service role (bypassa RLS).
drop policy if exists whatsapp_webhook_events_select on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_select on public.whatsapp_webhook_events
  for select to authenticated
  using (
    (empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
    or public.is_platform_admin()
  );

-- 3) Retenção: mantém os p_keep mais recentes por empresa.
create or replace function public.prune_whatsapp_webhook_events(
  p_empresa_id uuid, p_keep integer default 50
) returns void language sql as $$
  delete from public.whatsapp_webhook_events
  where empresa_id = p_empresa_id
    and id not in (
      select id from public.whatsapp_webhook_events
      where empresa_id = p_empresa_id
      order by created_at desc
      limit p_keep
    );
$$;

revoke execute on function public.prune_whatsapp_webhook_events(uuid, integer)
  from anon, authenticated, public;
```

- [ ] **Step 2: Aplicar e verificar**

Run (PowerShell):
```powershell
Set-Location "c:\Users\lucaw\Documents\VS Code Páginas\Junho2026\Estação Sapatão - RH\sapatao-rh"; npm run migrate
docker exec supabase_db_qysnyiufifgldieqnsly psql -U postgres -d postgres -c "select column_name from information_schema.columns where table_name='whatsapp_instances' and column_name like 'uazapi%' or column_name='webhook_public_url'; select count(*) from whatsapp_webhook_events;"
```
Expected: `apply 0017_uazapi_credenciais.sql ... OK`; as 3 colunas listadas; `count = 0`.

- [ ] **Step 3: Atualizar tipos TS**

Em `types/database.ts`, trocar o bloco `WhatsappInstance` (L50-61) por:

```ts
export type WhatsappInstance = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  uazapi_instance_id: string | null;
  uazapi_token: string | null;
  uazapi_base_url: string | null;
  uazapi_admin_token: string | null;
  webhook_public_url: string | null;
  webhook_secret: string;
  status: WhatsappStatus;
  phone_number: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
}

export type WhatsappWebhookEvent = {
  id: string;
  empresa_id: string;
  event: string | null;
  parsed_kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}
```

E dentro de `Database.public.Tables` (junto de `whatsapp_instances`, ~L239), adicionar:

```ts
      whatsapp_webhook_events: {
        Row: WhatsappWebhookEvent;
        Insert: Partial<WhatsappWebhookEvent> & { empresa_id: string; payload: Record<string, unknown> };
        Update: Partial<WhatsappWebhookEvent>;
        Relationships: [];
      };
```

- [ ] **Step 4: Compilar e commitar**

Run: `Set-Location "...\sapatao-rh"; npx tsc --noEmit`
Expected: sem erros.
```bash
git add sapatao-rh/supabase/migrations/0017_uazapi_credenciais.sql sapatao-rh/types/database.ts
git commit -m "feat(sp1d): migration 0017 - credenciais uazapi + log de eventos webhook"
```

---

### Task 2: `lib/uazapi/config.ts` — resolução de credenciais (TDD)

**Files:**
- Create: `sapatao-rh/lib/uazapi/config.ts`
- Test: `sapatao-rh/lib/uazapi/config.test.ts`

**Interfaces:**
- Produces: `type UazapiConfig = { baseUrl: string; adminToken: string | null }`
- Produces: `resolveUazapiConfig(row, env): UazapiConfig | null` (pura)
- Produces: `getUazapiConfig(admin, empresaId): Promise<UazapiConfig | null>` (wrapper service-role; `admin` é o retorno de `createAdminClient()`)

- [ ] **Step 1: Teste que falha**

```ts
// lib/uazapi/config.test.ts
import { describe, it, expect } from "vitest";
import { resolveUazapiConfig } from "./config";

describe("resolveUazapiConfig", () => {
  it("prefere credenciais do banco sobre env", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com/", uazapi_admin_token: "tok-db" },
      { url: "https://env.uazapi.com", adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: "tok-db" });
  });

  it("cai para env quando banco vazio (e normaliza barra final)", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: null, uazapi_admin_token: null },
      { url: "https://env.uazapi.com/", adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://env.uazapi.com", adminToken: "tok-env" });
  });

  it("mistura: base do banco + admin token do env", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com", uazapi_admin_token: null },
      { url: undefined, adminToken: "tok-env" },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: "tok-env" });
  });

  it("retorna null sem base URL em lugar nenhum", () => {
    expect(resolveUazapiConfig({ uazapi_base_url: null, uazapi_admin_token: "x" }, {})).toBeNull();
    expect(resolveUazapiConfig(null, {})).toBeNull();
  });

  it("adminToken null quando ausente nos dois", () => {
    const cfg = resolveUazapiConfig(
      { uazapi_base_url: "https://db.uazapi.com", uazapi_admin_token: null },
      { url: undefined, adminToken: undefined },
    );
    expect(cfg).toEqual({ baseUrl: "https://db.uazapi.com", adminToken: null });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location "...\sapatao-rh"; npx vitest run lib/uazapi/config.test.ts`
Expected: FAIL — `Cannot find module './config'`.

- [ ] **Step 3: Implementação mínima**

```ts
// lib/uazapi/config.ts
// Resolve as credenciais UAZAPI: banco (whatsapp_instances) > env. Null = não configurada.
import type { createAdminClient } from "@/lib/supabase/admin";

export type UazapiConfig = { baseUrl: string; adminToken: string | null };

type CredRow = { uazapi_base_url: string | null; uazapi_admin_token: string | null } | null;
type EnvLike = { url?: string; adminToken?: string };

const clean = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null;

export function resolveUazapiConfig(row: CredRow, env: EnvLike): UazapiConfig | null {
  const baseUrl = clean(row?.uazapi_base_url) ?? clean(env.url);
  if (!baseUrl) return null;
  const adminToken = clean(row?.uazapi_admin_token) ?? clean(env.adminToken);
  return { baseUrl, adminToken };
}

export async function getUazapiConfig(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: string,
): Promise<UazapiConfig | null> {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("uazapi_base_url, uazapi_admin_token")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return resolveUazapiConfig(data ?? null, {
    url: process.env.UAZAPI_API_URL,
    adminToken: process.env.UAZAPI_ADMIN_TOKEN,
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/uazapi/config.test.ts`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/uazapi/config.ts sapatao-rh/lib/uazapi/config.test.ts
git commit -m "feat(sp1d): resolucao de credenciais uazapi (banco > env)"
```

---

### Task 3: Client — `baseUrl` explícito + 4 correções da spec (TDD)

**Files:**
- Modify: `sapatao-rh/lib/uazapi/client.ts` (arquivo inteiro — assinaturas mudam)
- Test: `sapatao-rh/lib/uazapi/client.test.ts` (novo)
- Modify (call sites): `sapatao-rh/app/(app)/configuracoes/whatsapp/actions.ts` (só imports/chamadas — reescrito na Task 6; aqui apenas compilar com adaptação mínima), `sapatao-rh/app/api/whatsapp/send/route.ts:102-109`, `sapatao-rh/app/api/whatsapp/send-media/route.ts:115-125`, `sapatao-rh/app/api/whatsapp/webhook/[instanceId]/route.ts:113-117,138,153`

**Interfaces:**
- Produces (novas assinaturas — `baseUrl` sempre 1º parâmetro):
  - `createInstance(baseUrl, adminToken, name): Promise<{ instanceId: string; token: string }>`
  - `connectInstance(baseUrl, token, phone?): Promise<{ qr: string | null }>`
  - `instanceStatus(baseUrl, token): Promise<{ status: string; qr: string | null; paircode: string | null }>`
  - `disconnectInstance(baseUrl, token): Promise<void>`
  - `registerWebhook(baseUrl, token, url): Promise<void>`
  - `sendText(baseUrl, token, number, text, replyId?): Promise<{ providerId: string | null }>`
  - `markChatRead(baseUrl, token, number): Promise<void>`
  - `downloadMedia(baseUrl, token, providerMessageId): Promise<{ base64: string | null; mime: string | null }>`
  - `sendMedia(baseUrl, token, number, args): Promise<{ providerId: string | null }>`
- Fixtures dos testes copiam os exemplos da spec OpenAPI (create/status/download).

- [ ] **Step 1: Teste que falha (fixtures da spec)**

```ts
// lib/uazapi/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createInstance, instanceStatus, downloadMedia, markChatRead, sendMedia,
} from "./client";

const BASE = "https://fake.uazapi.com";
let fetchMock: ReturnType<typeof vi.fn>;

function mockJson(body: unknown) {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => body });
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

describe("createInstance (resposta real: instance é OBJETO)", () => {
  it("extrai instance.id e token do topo", async () => {
    mockJson({
      response: "Instance created successfully",
      token: "tok-abc",
      instance: { id: "r183e2ef9597845", name: "sapatao-x", status: "disconnected" },
    });
    const r = await createInstance(BASE, "admin-tok", "sapatao-x");
    expect(r).toEqual({ instanceId: "r183e2ef9597845", token: "tok-abc" });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/instance/create`);
    expect(opts.headers.admintoken).toBe("admin-tok");
  });
});

describe("instanceStatus (status do topo é OBJETO; string está em instance.status)", () => {
  it("lê instance.status e devolve qr/paircode renovados", async () => {
    mockJson({
      instance: { id: "r1", status: "connecting", qrcode: "data:image/png;base64,QR2", paircode: "1234-5678" },
      status: { connected: false, loggedIn: false },
    });
    const r = await instanceStatus(BASE, "tok");
    expect(r).toEqual({ status: "connecting", qr: "data:image/png;base64,QR2", paircode: "1234-5678" });
  });

  it("deriva de status.connected quando instance.status ausente", async () => {
    mockJson({ instance: {}, status: { connected: true, loggedIn: true } });
    const r = await instanceStatus(BASE, "tok");
    expect(r.status).toBe("connected");
  });
});

describe("downloadMedia (resposta real usa base64Data)", () => {
  it("extrai base64Data + mimetype", async () => {
    mockJson({ fileURL: "https://x/f.mp3", mimetype: "audio/mpeg", base64Data: "UklGRkj" });
    const r = await downloadMedia(BASE, "tok", "3EB0");
    expect(r).toEqual({ base64: "UklGRkj", mime: "audio/mpeg" });
  });
});

describe("markChatRead (spec pede JID)", () => {
  it("anexa @s.whatsapp.net quando faltando", async () => {
    mockJson({ response: "ok" });
    await markChatRead(BASE, "tok", "5551999000001");
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).number).toBe("5551999000001@s.whatsapp.net");
  });
  it("não duplica sufixo", async () => {
    mockJson({ response: "ok" });
    await markChatRead(BASE, "tok", "5551999000001@s.whatsapp.net");
    const [, opts] = fetchMock.mock.calls[0];
    expect(JSON.parse(opts.body).number).toBe("5551999000001@s.whatsapp.net");
  });
});

describe("sendMedia (legenda vai em text)", () => {
  it("monta body conforme a spec", async () => {
    mockJson({ messageid: "ABC1" });
    const r = await sendMedia(BASE, "tok", "5551999", {
      type: "document", fileBase64: "AAA=", mimetype: "application/pdf",
      docName: "cv.pdf", caption: "segue",
    });
    expect(r.providerId).toBe("ABC1");
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/send/media`);
    expect(JSON.parse(opts.body)).toEqual({
      number: "5551999", type: "document", file: "AAA=",
      mimetype: "application/pdf", docName: "cv.pdf", text: "segue",
    });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/uazapi/client.test.ts`
Expected: FAIL — assinaturas atuais não aceitam `baseUrl` (erros de tipo/execução).

- [ ] **Step 3: Reescrever `lib/uazapi/client.ts`**

Substituir o arquivo inteiro por:

```ts
import { extractQr, extractMessageId } from "./extract";

export class UazapiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `UAZAPI error ${status}`);
    this.name = "UazapiError";
  }
}

type Obj = Record<string, unknown>;
const asObj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

async function apiFetch(
  baseUrl: string,
  path: string,
  options: RequestInit & { headers?: Record<string, string> },
): Promise<unknown> {
  const url = `${baseUrl.replace(/\/+$/, "")}${path}`;
  const res = await fetch(url, options);
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  if (!res.ok) {
    throw new UazapiError(res.status, body);
  }
  return body;
}

/** Create a new UAZAPI instance. Uses admintoken header (no Bearer).
 *  Real response shape: { token, instance: { id, ... } } (instance is an OBJECT). */
export async function createInstance(
  baseUrl: string,
  adminToken: string,
  name: string,
): Promise<{ instanceId: string; token: string }> {
  const body = asObj(
    await apiFetch(baseUrl, "/instance/create", {
      method: "POST",
      headers: { "Content-Type": "application/json", admintoken: adminToken },
      body: JSON.stringify({ name }),
    }),
  );
  const instance = asObj(body["instance"]);
  const instanceId =
    str(instance["id"]) ?? str(body["instanceId"]) ?? str(body["id"]) ?? "";
  const token = str(body["token"]) ?? str(instance["token"]) ?? "";
  return { instanceId, token };
}

/** Connect an instance (start QR flow). Returns the QR string if available. */
export async function connectInstance(
  baseUrl: string,
  token: string,
  phone?: string,
): Promise<{ qr: string | null }> {
  const body = await apiFetch(baseUrl, "/instance/connect", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(phone ? { phone } : {}),
  });
  return { qr: extractQr(body) };
}

/** Instance status. Real response: { instance: {status, qrcode, paircode}, status: {connected, loggedIn} }.
 *  The QR is REFRESHED on every call while connecting — callers should re-render it. */
export async function instanceStatus(
  baseUrl: string,
  token: string,
): Promise<{ status: string; qr: string | null; paircode: string | null }> {
  const body = asObj(
    await apiFetch(baseUrl, "/instance/status", { method: "GET", headers: { token } }),
  );
  const instance = asObj(body["instance"]);
  const statusObj = asObj(body["status"]);
  const status =
    str(instance["status"]) ??
    (statusObj["connected"] === true || statusObj["loggedIn"] === true
      ? "connected"
      : str(body["state"]) ?? "disconnected");
  return {
    status,
    qr: extractQr(body),
    paircode: str(instance["paircode"]),
  };
}

/** Disconnect (logout) an instance. */
export async function disconnectInstance(baseUrl: string, token: string): Promise<void> {
  await apiFetch(baseUrl, "/instance/disconnect", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({}),
  });
}

/** Register/update the single webhook (UAZAPI "simple mode" — no action/id). Idempotent. */
export async function registerWebhook(
  baseUrl: string,
  token: string,
  url: string,
): Promise<void> {
  await apiFetch(baseUrl, "/webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      enabled: true,
      url,
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["wasSentByApi"],
    }),
  });
}

/** Send a text message. Returns the provider message id (tolerant extraction). */
export async function sendText(
  baseUrl: string,
  token: string,
  number: string,
  text: string,
  replyId?: string,
): Promise<{ providerId: string | null }> {
  const body = await apiFetch(baseUrl, "/send/text", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify(replyId ? { number, text, replyid: replyId } : { number, text }),
  });
  return { providerId: extractMessageId(body) };
}

/** Mark a chat as read. Spec wants a JID (5511...@s.whatsapp.net). Best-effort. */
export async function markChatRead(
  baseUrl: string,
  token: string,
  number: string,
): Promise<void> {
  const jid = number.includes("@") ? number : `${number}@s.whatsapp.net`;
  await apiFetch(baseUrl, "/chat/read", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({ number: jid, read: true }),
  });
}

/** Download received media. Real response field is `base64Data` (+ mimetype). */
export async function downloadMedia(
  baseUrl: string,
  token: string,
  providerMessageId: string,
): Promise<{ base64: string | null; mime: string | null }> {
  const body = asObj(
    await apiFetch(baseUrl, "/message/download", {
      method: "POST",
      headers: { "Content-Type": "application/json", token },
      body: JSON.stringify({ id: providerMessageId, return_base64: true, return_link: false }),
    }),
  );
  const base64 =
    str(body["base64Data"]) ?? str(body["base64"]) ?? str(body["data"]) ?? str(body["file"]);
  const mime = str(body["mimetype"]) ?? str(body["mime"]);
  return { base64, mime };
}

/** Send media. Caption goes in `text` (NOT `caption`); docName only for documents. */
export async function sendMedia(
  baseUrl: string,
  token: string,
  number: string,
  args: { type: "image" | "video" | "audio" | "ptt" | "document"; fileBase64: string; mimetype: string; docName?: string; caption?: string },
): Promise<{ providerId: string | null }> {
  const body = await apiFetch(baseUrl, "/send/media", {
    method: "POST",
    headers: { "Content-Type": "application/json", token },
    body: JSON.stringify({
      number,
      type: args.type,
      file: args.fileBase64,
      mimetype: args.mimetype,
      ...(args.docName ? { docName: args.docName } : {}),
      ...(args.caption ? { text: args.caption } : {}),
    }),
  });
  return { providerId: extractMessageId(body) };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/uazapi/client.test.ts`
Expected: 7 passed.

- [ ] **Step 5: Adaptar call sites para compilar**

1. `app/api/whatsapp/send/route.ts` — trocar o dep `sendText` (L102-109). Adicionar import no topo: `import { getUazapiConfig } from "@/lib/uazapi/config";` e logo após `const empresaId = profile.empresa_id;` (L26) inserir:

```ts
  const uazapiCfg = await getUazapiConfig(admin, empresaId);
```

E o dep vira:

```ts
    async sendText(token, number, text) {
      if (!uazapiCfg) return { providerId: null, error: "uazapi_nao_configurada" };
      try {
        const { providerId } = await uazapiSendText(
          uazapiCfg.baseUrl, token, number.replace(/\D/g, ""), text,
        );
        return { providerId };
      } catch (e) {
        return { providerId: null, error: e instanceof Error ? e.message : "send_error" };
      }
    },
```

2. `app/api/whatsapp/send-media/route.ts` — mesma coisa: import + `const uazapiCfg = await getUazapiConfig(admin, empresaId);` após L29, e o dep `sendMedia` (L115-125) vira:

```ts
    async sendMedia(token, number, args) {
      if (!uazapiCfg) return { providerId: null, error: "uazapi_nao_configurada" };
      try {
        const { providerId } = await uazapiSendMedia(
          uazapiCfg.baseUrl, token, number.replace(/\D/g, ""),
          { ...args, fileBase64: rawB64 },
        );
        return { providerId };
      } catch (e) {
        return { providerId: null, error: e instanceof Error ? e.message : "send_error" };
      }
    },
```

3. `app/api/whatsapp/webhook/[instanceId]/route.ts` — o select (L113-117) ganha a coluna nova:

```ts
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("id, empresa_id, webhook_secret, uazapi_token, uazapi_base_url")
      .eq("uazapi_instance_id", instanceId)
      .maybeSingle();
```

E no bloco de mídia (a partir de L136), resolver a base antes do `after()` e só baixar quando existir:

```ts
      if (MEDIA_TYPES.includes(event.messageType)) {
        const empresaId = inst.empresa_id;
        const token = inst.uazapi_token ?? "";
        const mediaBaseUrl = inst.uazapi_base_url ?? process.env.UAZAPI_API_URL ?? "";
        const providerMessageId = event.providerMessageId;
        if (mediaBaseUrl && token) {
          after(async () => {
            await downloadAndStoreInbound(
              { empresaId, providerMessageId, token },
              {
                // ... deps inalterados, exceto:
                download: (tk, pid) => downloadMedia(mediaBaseUrl, tk, pid),
                // ...
              },
            );
          });
        }
      }
```

(Os demais deps do `downloadAndStoreInbound` ficam idênticos aos atuais L144-164.)

4. `app/(app)/configuracoes/whatsapp/actions.ts` — adaptação mínima para compilar (a reescrita real é a Task 6): trocar as 5 chamadas para passarem base URL. Substituir `getUazapiEnv()` (L35-40) por:

```ts
import { getUazapiConfig } from "@/lib/uazapi/config";
```

Em `conectar()`: substituir L61-62 por:

```ts
  const admin0 = createAdminClient();
  const cfg = await getUazapiConfig(admin0, profile.empresa_id);
  if (!cfg) return { error: "uazapi_nao_configurada" };
  if (!cfg.adminToken) return { error: "uazapi_sem_admin_token" };
```

E as chamadas: `createInstance(cfg.baseUrl, cfg.adminToken, instanceName)` (L85), `connectInstance(cfg.baseUrl, uazapiToken)` (L113), `registerWebhook(cfg.baseUrl, uazapiToken, ...)` (L117). Em `statusInstancia()`: após carregar `instanceRow`, `const cfg = await getUazapiConfig(admin, profile.empresa_id); if (!cfg) return { error: "uazapi_nao_configurada" };` e `instanceStatus(cfg.baseUrl, instanceRow.uazapi_token)` — o retorno agora é `{ status, qr, paircode }`; usar `status` como antes e **retornar `qr` e `paircode` também**: `return { status: normalized, phone: instanceRow.phone_number, qr, paircode };`. Ajustar o tipo de retorno da action para `{ status?: string; phone?: string | null; qr?: string | null; paircode?: string | null; error?: string }`. Em `desconectar()`: `disconnectInstance(cfg.baseUrl, instanceRow.uazapi_token)` com o mesmo padrão (se `!cfg`, pular a chamada remota e só limpar estado local).

- [ ] **Step 6: Suíte inteira + commit**

Run: `npm run test`
Expected: todos passam (mocks de `lib/whatsapp/*.test.ts` não chamam o client real — deps injetadas — então só os call sites precisavam mudar).
```bash
git add sapatao-rh/lib/uazapi/client.ts sapatao-rh/lib/uazapi/client.test.ts sapatao-rh/app/api/whatsapp/send/route.ts sapatao-rh/app/api/whatsapp/send-media/route.ts "sapatao-rh/app/api/whatsapp/webhook/[instanceId]/route.ts" "sapatao-rh/app/(app)/configuracoes/whatsapp/actions.ts"
git commit -m "fix(sp1d): client uazapi conforme spec (instance objeto, base64Data, status, JID) + baseUrl explicito"
```

---

### Task 4: Parser — `EventType` + mimetype via `content` (TDD)

**Files:**
- Modify: `sapatao-rh/lib/uazapi/webhook-parser.ts:43-46,83`
- Test: `sapatao-rh/lib/uazapi/webhook-parser.test.ts` (adicionar casos)

**Interfaces:**
- Consumes/Produces: contrato `UazapiEvent` INALTERADO.

- [ ] **Step 1: Testes que falham** (adicionar ao arquivo de teste existente)

```ts
describe("tolerância de envelope (SP1d)", () => {
  it("aceita EventType como sinônimo de event", () => {
    const e = parseUazapiEvent({
      EventType: "messages",
      instance: "inst-1",
      message: { messageid: "M1", chatid: "5551999@s.whatsapp.net", fromMe: false, text: "oi" },
    });
    expect(e.kind).toBe("message");
  });

  it("extrai mimetype de message.content objeto", () => {
    const e = parseUazapiEvent({
      event: "messages",
      message: {
        messageid: "M2", chatid: "5551999@s.whatsapp.net", fromMe: false,
        messageType: "image", content: { mimetype: "image/jpeg", caption: "" },
      },
    });
    expect(e.kind).toBe("message");
    if (e.kind === "message") expect(e.mediaMime).toBe("image/jpeg");
  });

  it("extrai mimetype de message.content JSON serializado", () => {
    const e = parseUazapiEvent({
      event: "messages",
      message: {
        messageid: "M3", chatid: "5551999@s.whatsapp.net", fromMe: false,
        messageType: "document", content: '{"mimetype":"application/pdf"}',
      },
    });
    if (e.kind === "message") expect(e.mediaMime).toBe("application/pdf");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx vitest run lib/uazapi/webhook-parser.test.ts`
Expected: 3 novos FAIL.

- [ ] **Step 3: Implementar**

Em `webhook-parser.ts`, adicionar helper (após `contactNameFromChat`, L41):

```ts
function mimeFromContent(m: Obj): string | null {
  const c = m["content"];
  if (c && typeof c === "object") return str((c as Obj)["mimetype"]);
  if (typeof c === "string" && c.startsWith("{")) {
    try {
      return str((JSON.parse(c) as Obj)["mimetype"]);
    } catch {
      return null;
    }
  }
  return null;
}
```

Trocar L45: `const event = str(p["event"]) ?? str(p["EventType"]);`
Trocar L83: `mediaMime: str(m["mimetype"]) ?? str(m["mime"]) ?? mimeFromContent(m),`

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run lib/uazapi/webhook-parser.test.ts` → todos passam.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/uazapi/webhook-parser.ts sapatao-rh/lib/uazapi/webhook-parser.test.ts
git commit -m "feat(sp1d): parser tolera EventType e mimetype via content"
```

---

### Task 5: Webhook route — log de eventos brutos + retenção

**Files:**
- Modify: `sapatao-rh/app/api/whatsapp/webhook/[instanceId]/route.ts` (após a checagem de secret, ~L124-126)

**Interfaces:**
- Consumes: tabela `whatsapp_webhook_events` e função `prune_whatsapp_webhook_events` (Task 1).
- Produces: cada request autenticado gera 1 linha de log com `parsed_kind` = kind do parser.

- [ ] **Step 1: Integrar o log** — logo após `const event = parseUazapiEvent(raw);` (L126) inserir:

```ts
    // Diagnóstico: guarda o payload bruto + classificação (best-effort, nunca falha o 200).
    // Retenção de 50/empresa via prune (função SQL).
    try {
      await admin.from("whatsapp_webhook_events").insert({
        empresa_id: inst.empresa_id,
        event: typeof (raw as Record<string, unknown>)?.["event"] === "string"
          ? ((raw as Record<string, unknown>)["event"] as string)
          : typeof (raw as Record<string, unknown>)?.["EventType"] === "string"
            ? ((raw as Record<string, unknown>)["EventType"] as string)
            : null,
        parsed_kind: event.kind,
        payload: (raw ?? {}) as Record<string, unknown>,
      });
      await (admin as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<unknown> })
        .rpc("prune_whatsapp_webhook_events", { p_empresa_id: inst.empresa_id, p_keep: 50 });
    } catch (logErr) {
      console.error("webhook event log error:", logErr);
    }
```

- [ ] **Step 2: Verificação manual local** (Supabase + dev server no ar)

```powershell
# secret/instance de teste direto no banco:
docker exec supabase_db_qysnyiufifgldieqnsly psql -U postgres -d postgres -c "update whatsapp_instances set uazapi_instance_id='inst-teste', webhook_secret='s3cr3t' where true returning id;"
# dispara um evento:
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/whatsapp/webhook/inst-teste?secret=s3cr3t" -ContentType "application/json" -Body '{"event":"connection","status":"connected"}'
docker exec supabase_db_qysnyiufifgldieqnsly psql -U postgres -d postgres -c "select event, parsed_kind from whatsapp_webhook_events;"
```
Expected: `{ok: true}`; linha `connection | connection` no select.

- [ ] **Step 3: Suíte + commit**

Run: `npm run test` → verde.
```bash
git add "sapatao-rh/app/api/whatsapp/webhook/[instanceId]/route.ts"
git commit -m "feat(sp1d): webhook grava eventos brutos com retencao 50/empresa"
```

---

### Task 6: Validations + server actions de credenciais/webhook (TDD)

**Files:**
- Modify: `sapatao-rh/lib/validations/whatsapp.ts` (adicionar 2 schemas)
- Test: `sapatao-rh/lib/validations/whatsapp.test.ts` (criar se não existir; senão adicionar casos)
- Modify: `sapatao-rh/app/(app)/configuracoes/whatsapp/actions.ts` (novas actions + registro de webhook usa `webhook_public_url`)

**Interfaces:**
- Produces (schemas): `credenciaisUazapiSchema = { baseUrl: url http(s), adminToken: string min 8 | null }` — `null` significa "manter o token já salvo" (update sem tocar na coluna); `webhookPublicoSchema = { url: url http(s) }`.
- Produces (actions): `salvarCredenciais(input: { baseUrl: string; adminToken: string | null }): Promise<{ ok?: true; error?: string }>` — retorna `error: "token_obrigatorio"` quando é o primeiro save (INSERT) e `adminToken` veio `null`; `salvarWebhookPublico(input): Promise<{ ok?: true; registered: boolean; webhookUrl?: string; error?: string }>`.
- Consumes: `getUazapiConfig`, `registerWebhook(baseUrl, token, url)` (Task 3).

- [ ] **Step 1: Testes dos schemas (falham)**

```ts
// lib/validations/whatsapp.test.ts (adicionar/criar)
import { describe, it, expect } from "vitest";
import { credenciaisUazapiSchema, webhookPublicoSchema } from "./whatsapp";

describe("credenciaisUazapiSchema", () => {
  it("aceita URL https + token e normaliza espaços", () => {
    const r = credenciaisUazapiSchema.safeParse({
      baseUrl: " https://minha.uazapi.com/ ", adminToken: " tok-12345678 ",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.baseUrl).toBe("https://minha.uazapi.com");
      expect(r.data.adminToken).toBe("tok-12345678");
    }
  });
  it("aceita adminToken null (manter o já salvo)", () => {
    const r = credenciaisUazapiSchema.safeParse({ baseUrl: "https://x.uazapi.com", adminToken: null });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.adminToken).toBeNull();
  });
  it("rejeita URL inválida e token curto", () => {
    expect(credenciaisUazapiSchema.safeParse({ baseUrl: "nao-e-url", adminToken: "tok-12345678" }).success).toBe(false);
    expect(credenciaisUazapiSchema.safeParse({ baseUrl: "https://x.uazapi.com", adminToken: "curto" }).success).toBe(false);
  });
});

describe("webhookPublicoSchema", () => {
  it("aceita URL do túnel e remove barra final", () => {
    const r = webhookPublicoSchema.safeParse({ url: "https://abc.trycloudflare.com/" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.url).toBe("https://abc.trycloudflare.com");
  });
  it("rejeita não-URL", () => {
    expect(webhookPublicoSchema.safeParse({ url: "localhost sem esquema" }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run lib/validations/whatsapp.test.ts` → FAIL (schemas não existem).

- [ ] **Step 3: Implementar schemas** (fim de `lib/validations/whatsapp.ts`)

```ts
const urlLimpa = z
  .string()
  .trim()
  .pipe(z.url({ error: "URL inválida" }))
  .transform((u) => u.replace(/\/+$/, ""));

export const credenciaisUazapiSchema = z.object({
  baseUrl: urlLimpa,
  // null = manter o admin token já salvo (update parcial)
  adminToken: z.string().trim().min(8, "Token muito curto").nullable(),
});
export type CredenciaisUazapiInput = z.infer<typeof credenciaisUazapiSchema>;

export const webhookPublicoSchema = z.object({ url: urlLimpa });
export type WebhookPublicoInput = z.infer<typeof webhookPublicoSchema>;
```

- [ ] **Step 4: Rodar e ver passar** — `npx vitest run lib/validations/whatsapp.test.ts`.

- [ ] **Step 5: Novas actions** (adicionar a `app/(app)/configuracoes/whatsapp/actions.ts`; imports: `revalidatePath` de `next/cache`, os 2 schemas, `registerWebhook`)

```ts
/**
 * Salva as credenciais UAZAPI da empresa (upsert da linha da instância).
 * O token NUNCA volta para o cliente.
 */
export async function salvarCredenciais(input: {
  baseUrl: string;
  adminToken: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error };
  const { profile } = guard;

  const parsed = credenciaisUazapiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  // adminToken null = manter o token já salvo (só permitido em update)
  if (!existing && !parsed.data.adminToken) return { error: "token_obrigatorio" };

  const fields: Record<string, string> = { uazapi_base_url: parsed.data.baseUrl };
  if (parsed.data.adminToken) fields.uazapi_admin_token = parsed.data.adminToken;

  const { error } = existing
    ? await admin.from("whatsapp_instances").update(fields).eq("id", existing.id)
    : await admin.from("whatsapp_instances").insert({
        empresa_id: profile.empresa_id,
        nome: "WhatsApp RH",
        ...fields,
      });
  if (error) return { error: "db_error" };

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}

/**
 * Salva a URL pública (túnel/domínio) e registra o webhook na UAZAPI.
 * registered=false quando a instância ainda não foi provisionada (sem token).
 */
export async function salvarWebhookPublico(input: {
  url: string;
}): Promise<{ ok?: true; registered: boolean; webhookUrl?: string; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error, registered: false };
  const { profile } = guard;

  const parsed = webhookPublicoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido", registered: false };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("whatsapp_instances")
    .select("id, uazapi_instance_id, uazapi_token, webhook_secret")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();
  if (error || !row) return { error: "sem_instancia", registered: false };

  await admin
    .from("whatsapp_instances")
    .update({ webhook_public_url: parsed.data.url })
    .eq("id", row.id);

  if (!row.uazapi_instance_id || !row.uazapi_token) {
    revalidatePath("/configuracoes/whatsapp");
    return { ok: true, registered: false };
  }

  const cfg = await getUazapiConfig(admin, profile.empresa_id);
  if (!cfg) return { error: "uazapi_nao_configurada", registered: false };

  const webhookUrl = `${parsed.data.url}/api/whatsapp/webhook/${row.uazapi_instance_id}?secret=${row.webhook_secret}`;
  try {
    await registerWebhook(cfg.baseUrl, row.uazapi_token, webhookUrl);
  } catch {
    return { error: "registro_falhou", registered: false };
  }

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true, registered: true, webhookUrl };
}
```

Também em `conectar()`: trocar `getBaseUrl()` (L116) para preferir a URL pública salva:

```ts
  const { data: rowUrl } = await admin
    .from("whatsapp_instances")
    .select("webhook_public_url")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();
  const baseUrl = rowUrl?.webhook_public_url ?? (await getBaseUrl());
```

- [ ] **Step 6: Suíte + tsc + commit**

Run: `npm run test; npx tsc --noEmit` → verde/sem erros.
```bash
git add sapatao-rh/lib/validations/whatsapp.ts sapatao-rh/lib/validations/whatsapp.test.ts "sapatao-rh/app/(app)/configuracoes/whatsapp/actions.ts"
git commit -m "feat(sp1d): actions salvarCredenciais e salvarWebhookPublico"
```

---

### Task 7: UI — credenciais, webhook & diagnóstico, QR refresh

**Files:**
- Modify: `sapatao-rh/app/(app)/configuracoes/whatsapp/page.tsx` (carrega resumo + eventos)
- Create: `sapatao-rh/app/(app)/configuracoes/whatsapp/credenciais-form.tsx`
- Create: `sapatao-rh/app/(app)/configuracoes/whatsapp/webhook-panel.tsx`
- Modify: `sapatao-rh/app/(app)/configuracoes/whatsapp/whatsapp-instance-panel.tsx` (QR refresh + bloco "não configurada" aponta para o form)

**Interfaces:**
- Consumes: `salvarCredenciais`, `salvarWebhookPublico`, `statusInstancia` (agora retorna `qr`).
- Produces (props): `CredenciaisForm({ baseUrl, tokenMascarado })`, `WebhookPanel({ publicUrl, instanciaProvisionada, eventos })` com `eventos: { id, created_at, event, parsed_kind, payload }[]`.

- [ ] **Step 1: `credenciais-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarCredenciais } from "./actions";

interface Props {
  baseUrl: string | null;
  /** ex.: "••••1234" ou null quando nunca salvo */
  tokenMascarado: string | null;
}

export function CredenciaisForm({ baseUrl, tokenMascarado }: Props) {
  const [url, setUrl] = useState(baseUrl ?? "");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSalvar() {
    setSaving(true);
    try {
      // token vazio = manter o já salvo (adminToken: null)
      const r = await salvarCredenciais({ baseUrl: url, adminToken: token.trim() || null });
      if (r.error === "invalido") {
        toast.error("Confira a URL (https://...) e o admin token.");
        return;
      }
      if (r.error === "token_obrigatorio") {
        toast.error("Informe o admin token no primeiro cadastro.");
        return;
      }
      if (r.error) {
        toast.error("Erro ao salvar: " + r.error);
        return;
      }
      setToken("");
      toast.success("Credenciais salvas.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-neutro-900">Credenciais UAZAPI</h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          Servidor e admin token da sua conta UAZAPI. O token nunca é exibido depois de salvo.
        </p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutro-700">URL do servidor</span>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://xxxx.uazapi.com"
          className="w-full rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium text-neutro-700">Admin token</span>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={tokenMascarado ?? "cole o admin token"}
          autoComplete="off"
          className="w-full rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
        {tokenMascarado && !token && (
          <span className="text-xs text-neutro-500">
            Já configurado ({tokenMascarado}). Preencha para substituir.
          </span>
        )}
      </label>
      <Button onClick={handleSalvar} disabled={saving || !url || (!token && !tokenMascarado)}>
        {saving ? "Salvando..." : "Salvar credenciais"}
      </Button>
    </div>
  );
}
```

Semântica do token (já implementada na Task 6): campo vazio com `tokenMascarado` presente = manter o token salvo (`adminToken: null` → update não toca na coluna); primeiro cadastro sem token retorna `token_obrigatorio`.

- [ ] **Step 2: `webhook-panel.tsx`**

```tsx
"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { salvarWebhookPublico } from "./actions";

interface EventoRow {
  id: string;
  created_at: string;
  event: string | null;
  parsed_kind: string;
  payload: Record<string, unknown>;
}

interface Props {
  publicUrl: string | null;
  instanciaProvisionada: boolean;
  eventos: EventoRow[];
}

export function WebhookPanel({ publicUrl, instanciaProvisionada, eventos }: Props) {
  const [url, setUrl] = useState(publicUrl ?? "");
  const [saving, setSaving] = useState(false);

  async function handleSalvar() {
    setSaving(true);
    try {
      const r = await salvarWebhookPublico({ url });
      if (r.error === "invalido") return void toast.error("URL inválida (use https://...).");
      if (r.error === "sem_instancia")
        return void toast.error("Conecte o WhatsApp primeiro (bloco acima).");
      if (r.error) return void toast.error("Erro: " + r.error);
      toast.success(
        r.registered
          ? "Webhook registrado na UAZAPI."
          : "URL salva. O webhook será registrado ao conectar.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-lg border border-neutro-200 bg-white p-6 space-y-4">
      <div>
        <h2 className="font-semibold text-neutro-900">Webhook (recebimento)</h2>
        <p className="text-sm text-neutro-600 mt-0.5">
          URL pública que a UAZAPI usa para entregar mensagens. Rodando local, suba um túnel
          (<code className="bg-neutro-100 px-1 rounded">cloudflared tunnel --url http://localhost:3000</code>)
          e cole aqui a URL gerada.
        </p>
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://abc.trycloudflare.com"
          className="flex-1 rounded-md border border-neutro-200 px-3 py-2 text-sm"
        />
        <Button onClick={handleSalvar} disabled={saving || !url}>
          {saving ? "Registrando..." : "Salvar e registrar"}
        </Button>
      </div>
      {!instanciaProvisionada && (
        <p className="text-xs text-amber-700">
          A instância ainda não foi conectada — a URL fica salva e o registro acontece no Conectar.
        </p>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-neutro-900">Últimos eventos recebidos</h3>
        {eventos.length === 0 ? (
          <p className="text-sm text-neutro-500">
            Nenhum evento ainda. Depois de registrar o webhook, mande um “oi” para o número
            conectado e recarregue.
          </p>
        ) : (
          <ul className="divide-y divide-neutro-100 text-sm">
            {eventos.map((ev) => (
              <li key={ev.id} className="py-2">
                <details>
                  <summary className="cursor-pointer flex items-center gap-2">
                    <span className="text-neutro-500 tabular-nums">
                      {new Date(ev.created_at).toLocaleString("pt-BR")}
                    </span>
                    <code className="bg-neutro-100 px-1 rounded">{ev.event ?? "?"}</code>
                    <span className="text-neutro-600">→ {ev.parsed_kind}</span>
                  </summary>
                  <pre className="mt-2 max-h-64 overflow-auto rounded bg-neutro-50 p-2 text-xs">
                    {JSON.stringify(ev.payload, null, 2)}
                  </pre>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: page.tsx** — carregar resumo (service role, só derivados) + eventos (RLS):

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { WhatsappInstancePanel } from "./whatsapp-instance-panel";
import { CredenciaisForm } from "./credenciais-form";
import { WebhookPanel } from "./webhook-panel";
import type { WhatsappStatus, WhatsappWebhookEvent } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function WhatsappPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  // Service role: lê credenciais mas passa ao client APENAS derivados não-sensíveis.
  const admin = createAdminClient();
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select(
      "status, phone_number, uazapi_instance_id, uazapi_base_url, uazapi_admin_token, webhook_public_url",
    )
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  const tokenMascarado = inst?.uazapi_admin_token
    ? `••••${inst.uazapi_admin_token.slice(-4)}`
    : null;

  // Eventos via RLS (policy: admin do tenant).
  const supabase = await createClient();
  const { data: eventos } = await supabase
    .from("whatsapp_webhook_events" as "whatsapp_webhook_events")
    .select("id, created_at, event, parsed_kind, payload")
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-display text-2xl font-bold">WhatsApp</h1>
          <p className="text-sm text-neutro-700 mt-1">
            Conecte o número de WhatsApp da empresa para receber candidaturas.
          </p>
        </div>

        <CredenciaisForm baseUrl={inst?.uazapi_base_url ?? null} tokenMascarado={tokenMascarado} />

        <WhatsappInstancePanel
          initialStatus={(inst?.status as WhatsappStatus) ?? "desconectado"}
          initialPhone={inst?.phone_number ?? null}
        />

        <WebhookPanel
          publicUrl={inst?.webhook_public_url ?? null}
          instanciaProvisionada={!!inst?.uazapi_instance_id}
          eventos={(eventos ?? []) as Pick<WhatsappWebhookEvent, "id" | "created_at" | "event" | "parsed_kind" | "payload">[]}
        />
      </div>
    </PageContainer>
  );
}
```

- [ ] **Step 4: QR refresh no `whatsapp-instance-panel.tsx`** — em `pollStatus` (L51-70), aproveitar o `qr` retornado:

```ts
  const pollStatus = useCallback(async () => {
    const result = await statusInstancia();
    if (result.error) return;

    const newStatus = (result.status ?? "desconectado") as WhatsappStatus;
    setStatus(newStatus);
    if (result.phone) setPhone(result.phone);
    // QR é RENOVADO pelo gateway a cada consulta — atualiza a imagem enquanto aguarda.
    if (result.qr && newStatus !== "conectado") setQr(result.qr);
    setPaircode(newStatus === "conectado" ? null : (result.paircode ?? null));

    if (newStatus === "conectado") {
      setQr(null);
      stopPolling();
      toast.success("WhatsApp conectado com sucesso!");
    }
    if (newStatus === "desconectado") {
      setQr(null);
      stopPolling();
    }
  }, [stopPolling]);
```

Adicionar o estado `const [paircode, setPaircode] = useState<string | null>(null);` junto aos demais (L37-41) e, no JSX, logo abaixo do bloco do QR (após L172):

```tsx
      {paircode && (
        <p className="text-center text-sm text-neutro-600">
          Ou use o código de pareamento:{" "}
          <code className="bg-neutro-100 px-1.5 py-0.5 rounded font-semibold">{paircode}</code>
        </p>
      )}
```

E o bloco `uazapiMissing` (L126-145): trocar o texto para apontar para o formulário:

```tsx
        <p className="text-sm text-neutro-600">
          Salve a URL do servidor e o admin token no bloco “Credenciais UAZAPI” acima
          e tente conectar novamente.
        </p>
```

(Remover a menção a env vars; manter o botão "Tentar novamente". `handleConectar` também deve tratar `result.error === "uazapi_sem_admin_token"` como `setUazapiMissing(true)`.)

- [ ] **Step 5: Verificação manual + suíte**

Run: `npm run test` → verde. Depois, com o app rodando, abrir `http://localhost:3000/configuracoes/whatsapp` logado como admin:
Expected: 3 blocos (Credenciais / Conexão / Webhook & eventos); salvar credenciais fake mostra toast de sucesso; o evento `connection` do teste da Task 5 aparece na lista.

- [ ] **Step 6: Commit**

```bash
git add "sapatao-rh/app/(app)/configuracoes/whatsapp/"
git commit -m "feat(sp1d): tela de credenciais + webhook/diagnostico + QR refresh"
```

---

### Task 8: Contract test — gateway falso in-process (vitest, fetch REAL)

**Files:**
- Create: `sapatao-rh/lib/uazapi/gateway.contract.test.ts`

**Interfaces:**
- Consumes: TODAS as funções do client (Task 3) contra um `node:http` server com as respostas literais da spec.

- [ ] **Step 1: Escrever o teste (já deve passar — é rede de segurança de contrato)**

```ts
// Contrato client ↔ gateway: sobe um UAZAPI falso (node:http) com respostas da spec
// e chama o client com fetch REAL (sem mock). Valida paths, headers e bodies.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import {
  createInstance, connectInstance, instanceStatus, disconnectInstance,
  registerWebhook, sendText, sendMedia, downloadMedia, markChatRead,
} from "./client";

type Recorded = { method: string; path: string; headers: Record<string, unknown>; body: unknown };
const recorded: Recorded[] = [];
let server: Server;
let base: string;

const ROUTES: Record<string, unknown> = {
  "POST /instance/create": {
    token: "tok-inst", instance: { id: "r1x", name: "sapatao-t", status: "disconnected" },
  },
  "POST /instance/connect": {
    connected: false, loggedIn: false,
    instance: { id: "r1x", status: "connecting", qrcode: "data:image/png;base64,QR1" },
  },
  "GET /instance/status": {
    instance: { id: "r1x", status: "connecting", qrcode: "data:image/png;base64,QR2", paircode: "12-34" },
    status: { connected: false, loggedIn: false },
  },
  "POST /instance/disconnect": { response: "ok" },
  "POST /webhook": { id: "wh1", enabled: true },
  "POST /send/text": { messageid: "3EB0AAA" },
  "POST /send/media": { messageid: "3EB0BBB" },
  "POST /message/download": { fileURL: "http://x/f.pdf", mimetype: "application/pdf", base64Data: "JVBERi0=" },
  "POST /chat/read": { response: "ok" },
};

beforeAll(async () => {
  server = createServer((req: IncomingMessage, res: ServerResponse) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      recorded.push({
        method: req.method ?? "", path,
        headers: req.headers as Record<string, unknown>,
        body: raw ? JSON.parse(raw) : null,
      });
      const hit = ROUTES[`${req.method} ${path}`];
      res.writeHead(hit ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify(hit ?? { error: "not found" }));
    });
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
});
afterAll(() => new Promise<void>((ok) => server.close(() => ok())));

describe("contrato client ↔ gateway UAZAPI (spec fixtures)", () => {
  it("ciclo de instância: create → connect → status → disconnect", async () => {
    const created = await createInstance(base, "admin-tok", "sapatao-t");
    expect(created).toEqual({ instanceId: "r1x", token: "tok-inst" });

    const conn = await connectInstance(base, "tok-inst");
    expect(conn.qr).toBe("data:image/png;base64,QR1");

    const st = await instanceStatus(base, "tok-inst");
    expect(st).toEqual({ status: "connecting", qr: "data:image/png;base64,QR2", paircode: "12-34" });

    await disconnectInstance(base, "tok-inst");

    expect(recorded[0].headers.admintoken).toBe("admin-tok");
    expect(recorded[1].headers.token).toBe("tok-inst");
  });

  it("webhook simple-mode com anti-loop", async () => {
    await registerWebhook(base, "tok-inst", "https://tunel.example/api/whatsapp/webhook/r1x?secret=s");
    const call = recorded.find((r) => r.path === "/webhook");
    expect(call?.body).toEqual({
      enabled: true,
      url: "https://tunel.example/api/whatsapp/webhook/r1x?secret=s",
      events: ["messages", "messages_update", "connection"],
      excludeMessages: ["wasSentByApi"],
    });
  });

  it("envio de texto e mídia devolve providerId", async () => {
    const t = await sendText(base, "tok-inst", "5551999000001", "olá!");
    expect(t.providerId).toBe("3EB0AAA");
    const m = await sendMedia(base, "tok-inst", "5551999000001", {
      type: "document", fileBase64: "AAA=", mimetype: "application/pdf", docName: "cv.pdf",
    });
    expect(m.providerId).toBe("3EB0BBB");
  });

  it("download de mídia usa base64Data e chat/read usa JID", async () => {
    const d = await downloadMedia(base, "tok-inst", "3EB0CCC");
    expect(d).toEqual({ base64: "JVBERi0=", mime: "application/pdf" });
    await markChatRead(base, "tok-inst", "5551999000001");
    const call = recorded.filter((r) => r.path === "/chat/read").at(-1);
    expect((call?.body as { number: string }).number).toBe("5551999000001@s.whatsapp.net");
  });
});
```

- [ ] **Step 2: Rodar** — `npx vitest run lib/uazapi/gateway.contract.test.ts`
Expected: 4 passed. (Se o ambiente de teste for jsdom e bloquear `node:http`, adicionar na primeira linha do arquivo: `// @vitest-environment node`.)

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/lib/uazapi/gateway.contract.test.ts
git commit -m "test(sp1d): contrato client-gateway com uazapi falso in-process"
```

---

### Task 9: E2E `verify-sp1d-uazapi.mjs` + runbook

**Files:**
- Create: `sapatao-rh/supabase/verify-sp1d-uazapi.mjs`
- Create: `docs/superpowers/runbooks/uazapi-live.md`
- Modify: `sapatao-rh/package.json` (script `"verify:sp1d": "node supabase/verify-sp1d-uazapi.mjs"`)

**Interfaces:**
- Consumes: app rodando em `http://localhost:3000` + Supabase local; envelope do espelho (`event`/`message.*`).
- Produces: prova executável do ciclo recebimento (texto+mídia+status+connection) e do contrato de download.

- [ ] **Step 1: Escrever o script**

```js
// E2E SP1d: exercita o WEBHOOK do app contra um gateway UAZAPI falso local.
// Pré-requisitos: supabase local + `npm run dev` no ar. Roda: npm run verify:sp1d
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const APP = "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
const ok = (name, cond) => (cond ? (pass++, console.log("  ✔", name)) : (fail++, console.error("  ✘", name)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── gateway falso (só o que o webhook dispara: download de mídia) ────────────
const hits = [];
const gateway = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    hits.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url === "/message/download") {
      // "JVBERi0..." é um PDF mínimo em base64 (assinatura %PDF-)
      res.end(JSON.stringify({ mimetype: "application/pdf", base64Data: "JVBERi0xLjQKJSVFT0Y=" }));
    } else {
      res.end(JSON.stringify({ response: "ok" }));
    }
  });
});
await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
const GATEWAY = `http://127.0.0.1:${gateway.address().port}`;

async function main() {
  const { data: empresa } = await admin.from("empresas").select("id").eq("slug", "estacao-sapatao").single();

  // Instância de teste apontando para o gateway falso
  const instanceId = `e2e-${randomUUID().slice(0, 8)}`;
  const secret = randomUUID().replaceAll("-", "");
  await admin.from("whatsapp_instances").upsert(
    {
      empresa_id: empresa.id, nome: "WhatsApp RH",
      uazapi_instance_id: instanceId, uazapi_token: "tok-e2e",
      uazapi_base_url: GATEWAY, uazapi_admin_token: "admin-e2e",
      webhook_secret: secret, status: "conectado",
    },
    { onConflict: "empresa_id" },
  );

  const hook = (body) =>
    fetch(`${APP}/api/whatsapp/webhook/${instanceId}?secret=${secret}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  console.log("1) inbound texto");
  const phone = `5551977${String(Date.now()).slice(-6)}`;
  const msgId = `E2E-${randomUUID().slice(0, 12)}`;
  let r = await hook({
    event: "messages", instance: instanceId,
    message: {
      messageid: msgId, chatid: `${phone}@s.whatsapp.net`, fromMe: false,
      messageType: "text", text: "Olá, tenho interesse na vaga",
      senderName: "Candidata E2E", wasSentByApi: false,
      chat: { wa_name: "Candidata E2E" },
    },
  });
  ok("webhook respondeu 200", r.status === 200);
  await sleep(700);
  const { data: cand } = await admin.from("candidatos").select("id, nome").eq("empresa_id", empresa.id).eq("telefone", phone).maybeSingle();
  ok("candidato criado com nome do chat", cand?.nome === "Candidata E2E");
  const { data: msg } = await admin.from("messages").select("id, conteudo, direction").eq("empresa_id", empresa.id).eq("uazapi_msg_id", msgId).maybeSingle();
  ok("mensagem inbound gravada", msg?.direction === "inbound" && msg?.conteudo?.includes("interesse"));

  console.log("2) dedup na reentrega");
  await hook({
    event: "messages", instance: instanceId,
    message: { messageid: msgId, chatid: `${phone}@s.whatsapp.net`, fromMe: false, messageType: "text", text: "Olá, tenho interesse na vaga" },
  });
  await sleep(500);
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("uazapi_msg_id", msgId);
  ok("sem duplicata", count === 1);

  console.log("3) inbound mídia → download no gateway (base64Data) → storage");
  const mediaId = `E2E-${randomUUID().slice(0, 12)}`;
  await hook({
    event: "messages", instance: instanceId,
    message: {
      messageid: mediaId, chatid: `${phone}@s.whatsapp.net`, fromMe: false,
      messageType: "document", content: { mimetype: "application/pdf" },
      senderName: "Candidata E2E", wasSentByApi: false,
    },
  });
  await sleep(2500); // after() roda pós-resposta
  const dl = hits.find((h) => h.url === "/message/download" && h.body?.id === mediaId);
  ok("gateway recebeu /message/download com id certo", !!dl && dl.body.return_base64 === true);
  const { data: mmsg } = await admin.from("messages").select("midia_url, midia_mime").eq("empresa_id", empresa.id).eq("uazapi_msg_id", mediaId).maybeSingle();
  ok("mensagem tem midia_url + mime", !!mmsg?.midia_url && mmsg?.midia_mime === "application/pdf");
  if (mmsg?.midia_url) {
    const { data: blob } = await admin.storage.from("whatsapp-media").download(mmsg.midia_url);
    ok("arquivo existe no bucket", !!blob && blob.size > 0);
  }

  console.log("4) status forward-only");
  await hook({ event: "messages_update", instance: instanceId, messageid: msgId, status: "read" });
  await sleep(500);
  const { data: after1 } = await admin.from("messages").select("status").eq("uazapi_msg_id", msgId).eq("empresa_id", empresa.id).single();
  ok("status avançou (read)", after1.status === "read");
  await hook({ event: "messages_update", instance: instanceId, messageid: msgId, status: "delivered" });
  await sleep(500);
  const { data: after2 } = await admin.from("messages").select("status").eq("uazapi_msg_id", msgId).eq("empresa_id", empresa.id).single();
  ok("não regrediu (segue read)", after2.status === "read");

  console.log("5) connection + log de eventos");
  await hook({ event: "connection", instance: instanceId, status: "connected" });
  await sleep(500);
  const { data: instRow } = await admin.from("whatsapp_instances").select("status").eq("empresa_id", empresa.id).single();
  ok("instância marcada conectado", instRow.status === "conectado");
  const { data: evs } = await admin.from("whatsapp_webhook_events").select("parsed_kind").eq("empresa_id", empresa.id).order("created_at", { ascending: false }).limit(50);
  ok("eventos logados (message/status/connection)", ["message", "status", "connection"].every((k) => evs.some((e) => e.parsed_kind === k)));
  ok("retenção ≤ 50", (evs?.length ?? 0) <= 50);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exit(fail ? 1 : 0);
}

main().finally(() => gateway.close());
```

- [ ] **Step 2: Adicionar o script npm** — em `sapatao-rh/package.json` (bloco scripts): `"verify:sp1d": "node supabase/verify-sp1d-uazapi.mjs"`.

- [ ] **Step 3: Rodar** (supabase local + dev server no ar):

```powershell
Set-Location "...\sapatao-rh"; npm run verify:sp1d
```
Expected: `N ok, 0 falhas`, exit 0. Se falhar: diagnosticar ANTES de seguir (esse script é o critério de aceitação nº 4 da spec).

- [ ] **Step 4: Runbook `docs/superpowers/runbooks/uazapi-live.md`**

```markdown
# Runbook — Conectar a UAZAPI ao vivo (SP1d)

Pré-requisito: conta UAZAPI (URL do servidor, ex. `https://xxxx.uazapi.com`, + admin token).

## Passo a passo
1. Suba tudo local: Docker Desktop → `supabase start` (pasta sapatao-rh) → `npm run dev`.
2. Túnel para o webhook (recebimento): em outro terminal,
   `cloudflared tunnel --url http://localhost:3000`
   (ou `ngrok http 3000`). Copie a URL https gerada.
3. No app (admin): Configurações → WhatsApp.
   a. Bloco **Credenciais UAZAPI**: cole URL do servidor + admin token → Salvar.
   b. Bloco **Conexão**: Conectar → escaneie o QR no WhatsApp do número da empresa
      (Aparelhos conectados → Conectar aparelho). O QR se renova sozinho; aguarde o
      badge ficar "Conectado".
   c. Bloco **Webhook**: cole a URL do túnel → "Salvar e registrar".
4. Teste de fumaça:
   a. De um celular pessoal, mande "olá" para o número conectado.
   b. Veja o evento aparecer em "Últimos eventos recebidos" (recarregue) e a conversa
      na Central de Atendimento (/atendimento).
   c. Responda pela Central e confirme no celular (e o status ✓✓ na UI).
   d. Mande um PDF pelo celular e confirme o anexo na conversa.

## Troubleshooting
- **Evento não aparece no painel** → túnel caiu ou URL errada: suba o túnel, cole a URL
  nova e "Salvar e registrar" de novo (o registro é idempotente).
- **Evento aparece como `ignore`** → o formato real divergiu do parser: expanda o JSON
  bruto no painel, copie e ajuste `lib/uazapi/webhook-parser.ts` (+ teste com esse payload).
- **QR não conecta** → ele expira em ~2 min, mas o polling renova; se travar, Desconectar
  e Conectar de novo.
- **Envio falha com 502** → confira credenciais (bloco 1) e o status "Conectado";
  detalhe do erro fica em `messages.metadata.error`.
- **Trocou de túnel (URL nova a cada sessão do cloudflared free)** → repita apenas o
  passo 3c.
```

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/supabase/verify-sp1d-uazapi.mjs sapatao-rh/package.json docs/superpowers/runbooks/uazapi-live.md
git commit -m "test(sp1d): e2e webhook com gateway falso + runbook uazapi ao vivo"
```

---

### Task 10: Gate final — suíte, lint, build

**Files:** nenhum novo (só correções que surgirem).

- [ ] **Step 1: Rodar tudo**

```powershell
Set-Location "...\sapatao-rh"
npm run test        # esperado: 190 antigos + ~20 novos, 0 falhas
npm run lint        # esperado: 0 erros
npx tsc --noEmit    # esperado: 0 erros
npm run build       # esperado: build OK
npm run verify:sp1d # com dev server no ar: 0 falhas
```

- [ ] **Step 2: Corrigir o que aparecer e commitar**

```bash
git add -A
git commit -m "chore(sp1d): gate final - suite, lint e build verdes"
```

(Se nada mudou, pular o commit.)
