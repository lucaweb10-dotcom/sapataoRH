# SP6 — Jornada do RH: lead manual, conversa ativa, triagem no chat, filtros e notificações · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Completar as duas jornadas da pessoa de RH: (a) inbound — mensagem chega → notificação em qualquer tela → triagem completa sem sair do chat (etapa, tags, vaga, responsável, dados) → filtros por dono/vaga/unidade no Kanban; (b) outbound — cadastrar candidato manualmente → iniciar conversa de WhatsApp com template de saudação pré-preenchido → conversa segue o fluxo normal da Central.

**Architecture:** Sem migration nova — tudo usa colunas/tabelas existentes (`candidatos.atribuido_a/tags/vaga_interesse/origem`, `message_templates`, `conversations`). Novas server actions em `app/(app)/candidatos/actions.ts` (RLS client, roles admin/rh — a policy `candidatos_write`/`conversations_write` da 0007 já permite INSERT/UPDATE para admin/rh). Substituição de variáveis de template é função pura em `lib/whatsapp/templates.ts`. Filtros do Kanban e da Central são URL-driven (`?q=&vaga=&resp=&u=` e `?f=`); o seletor de unidade da topbar passa a escrever `?u=` e o Zustand `stores/unidade-store.ts` morre. Notificações globais: 1 canal realtime num provider no layout do grupo `(app)` (badge na sidebar + toast + som opcional via WebAudio).

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres+RLS, realtime), Zod v4, vitest, TypeScript, Base UI (`components/ui/*`), sonner.

**Spec:** `docs/superpowers/specs/2026-07-09-sp6-jornada-rh-design.md`

**Cobertura da spec → tasks:** §3 (ações de dados) → Tasks 1-2 · §4 Bloco A (lead manual + conversa ativa + templates) → Tasks 3, 6, 7, 8 · §5 Bloco B (painel de ação + ficha) → Tasks 4, 5 · §6 Bloco C (filtros) → Tasks 9, 10 · §7 Bloco D (notificações) → Task 11 · §9 critérios 1-7 → Tasks 3/6/7/8/5/9/10/11/12.

## Global Constraints

- Trabalho SEMPRE no worktree `C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt` (branch `feat/sp6-jornada-rh`) — NUNCA no checkout principal. Todo comando npm/npx começa com `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"` (o cwd do PowerShell reseta entre comandos).
- PowerShell 5.1: sem `&&` (use `;` ou comandos separados); caminhos com parênteses/colchetes SEMPRE entre aspas no git (`"sapatao-rh/app/(app)/..."`).
- SEM migration nova (spec §2). Zod v4 (`z.uuid()`, `z.enum` direto). Next 16: `params`/`searchParams` são async (`await`). Tipos: `types/database.ts` usa Row types como **type alias** + `Relationships: []` — nada a mudar lá nesta fatia.
- Realtime: padrão anti-StrictMode do projeto (flag `cancelled` checada após **cada** await; `.on()` antes de `.subscribe()`; `setAuth` antes de subscrever — ver `components/funil/realtime.tsx`).
- supabase-js NÃO lança — sempre checar `{ error }` no retorno.
- Copy pt-BR na UI; estilo visual Editorial Sereno existente (classes `neutro-*`, `brand-*`, `sapatao-verde`, componentes `components/ui/*`, `shadow-warm`).
- Suíte inteira verde ao fim de CADA task: `npm run test` (237 testes hoje + os novos). Commits pequenos por task, mensagens `feat(sp6): ...`.

---

### Task 1: `lib/whatsapp/templates.ts` — `preencherTemplate` pura (TDD) + `listTemplatesAtivos`

**Files:**
- Create: `sapatao-rh/lib/whatsapp/templates.ts`
- Test: `sapatao-rh/lib/whatsapp/templates.test.ts`
- Modify: `sapatao-rh/lib/chat/queries.ts` (adiciona `listTemplatesAtivos` — a query fica aqui para o arquivo puro continuar testável sem importar `@/lib/supabase/server`)

**Interfaces:**
- Produces: `type DadosTemplate = { nome?: string | null; vaga?: string | null; unidade?: string | null }`
- Produces: `primeiroNome(nome: string | null | undefined): string` (pura)
- Produces: `preencherTemplate(conteudo: string, dados: DadosTemplate): string` (pura — `{{nome}}` → primeiro nome; `{{vaga}}`/`{{unidade}}`; variável sem valor ou desconhecida é REMOVIDA, nunca sobra `{{...}}`)
- Produces: `listTemplatesAtivos(): Promise<MessageTemplate[]>` (RLS-scoped, `ativo=true`, ordenado por categoria/nome)

- [ ] **Step 1: Teste que falha**

```ts
// lib/whatsapp/templates.test.ts
import { describe, it, expect } from "vitest";
import { preencherTemplate, primeiroNome } from "./templates";

describe("primeiroNome", () => {
  it("extrai o primeiro nome", () => {
    expect(primeiroNome("Ana Paula Souza")).toBe("Ana");
    expect(primeiroNome("  Bruna  ")).toBe("Bruna");
  });
  it("vazio/null vira string vazia", () => {
    expect(primeiroNome("")).toBe("");
    expect(primeiroNome(null)).toBe("");
    expect(primeiroNome(undefined)).toBe("");
  });
});

describe("preencherTemplate", () => {
  it("substitui nome (primeiro), vaga e unidade", () => {
    const r = preencherTemplate(
      "Olá {{nome}}! Vi seu interesse na vaga {{vaga}} da unidade {{unidade}}.",
      { nome: "Ana Paula Souza", vaga: "Atendente", unidade: "Centro" },
    );
    expect(r).toBe("Olá Ana! Vi seu interesse na vaga Atendente da unidade Centro.");
  });

  it("tolera espaços dentro das chaves e maiúsculas", () => {
    const r = preencherTemplate("Oi {{ Nome }}, vaga {{ VAGA }}.", {
      nome: "Bia Costa",
      vaga: "Cozinha",
    });
    expect(r).toBe("Oi Bia, vaga Cozinha.");
  });

  it("variável sem valor é removida sem sobrar {{...}} nem espaço órfão", () => {
    const r = preencherTemplate("Olá {{nome}}, tudo bem? Sobre a vaga {{vaga}} !", {
      nome: null,
      vaga: null,
    });
    expect(r).not.toContain("{{");
    expect(r).toBe("Olá, tudo bem? Sobre a vaga!");
  });

  it("variável desconhecida também é removida", () => {
    const r = preencherTemplate("Oi {{nome}} {{sobrenome}}!", { nome: "Ana Souza" });
    expect(r).toBe("Oi Ana!");
  });

  it("mantém quebras de linha e limpa bordas de cada linha", () => {
    const r = preencherTemplate("Olá {{nome}}!\nVaga: {{vaga}}\nAté já.", { nome: "Ana" });
    expect(r).toBe("Olá Ana!\nVaga:\nAté já.");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/whatsapp/templates.test.ts
```
Expected: FAIL — `Cannot find module './templates'`.

- [ ] **Step 3: Implementação**

```ts
// lib/whatsapp/templates.ts
// Substituição de variáveis de templates de mensagem (SP6). Função PURA (sem I/O)
// para ser testável — a query de templates fica em lib/chat/queries.ts.

export type DadosTemplate = {
  nome?: string | null;
  vaga?: string | null;
  unidade?: string | null;
};

/** Primeiro nome do candidato ("Ana Paula Souza" → "Ana"). */
export function primeiroNome(nome: string | null | undefined): string {
  if (!nome) return "";
  return nome.trim().split(/\s+/)[0] ?? "";
}

const PLACEHOLDER = /\{\{\s*([a-zA-Z_]+)\s*\}\}/g;

/**
 * Preenche {{nome}} (primeiro nome), {{vaga}} e {{unidade}} no conteúdo.
 * Variável sem valor (ou desconhecida) é REMOVIDA — nunca sobra {{...}} no texto —
 * e o espaçamento/pontuação ao redor é normalizado.
 */
export function preencherTemplate(conteudo: string, dados: DadosTemplate): string {
  const valores: Record<string, string> = {
    nome: primeiroNome(dados.nome),
    vaga: dados.vaga?.trim() ?? "",
    unidade: dados.unidade?.trim() ?? "",
  };
  return conteudo
    .replace(PLACEHOLDER, (_m, chave: string) => valores[chave.toLowerCase()] ?? "")
    .replace(/[ \t]{2,}/g, " ") // espaços duplos deixados por variáveis vazias
    .replace(/ ([,.!?;:])/g, "$1") // espaço órfão antes de pontuação
    .replace(/^[ \t]+|[ \t]+$/gm, ""); // sobras nas bordas de cada linha
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/whatsapp/templates.test.ts`
Expected: 7 passed.

- [ ] **Step 5: `listTemplatesAtivos` em `lib/chat/queries.ts`**

Trocar a linha 3 (import de tipos):

```ts
import type { Candidato, Conversation, Message } from "@/types/database";
```

por:

```ts
import type { Candidato, Conversation, Message, MessageTemplate } from "@/types/database";
```

E adicionar ao FIM do arquivo:

```ts
/** Templates de mensagem ativos da empresa (RLS-scoped), ordenados por categoria/nome. */
export async function listTemplatesAtivos(): Promise<MessageTemplate[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("message_templates")
    .select("*")
    .eq("ativo", true)
    .order("categoria", { ascending: true })
    .order("nome", { ascending: true });
  if (error) {
    console.error("[chat/queries] listTemplatesAtivos error:", error);
    return [];
  }
  return (data ?? []) as MessageTemplate[];
}
```

- [ ] **Step 6: Suíte + tsc + commit**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit
```
Expected: 244 passed (237 + 7); tsc sem erros.

```bash
git add sapatao-rh/lib/whatsapp/templates.ts sapatao-rh/lib/whatsapp/templates.test.ts sapatao-rh/lib/chat/queries.ts
git commit -m "feat(sp6): preencherTemplate pura + listTemplatesAtivos"
```

---

### Task 2: Schemas Zod (TDD) + server actions de candidatos + `listVagasDistintas`

**Files:**
- Create: `sapatao-rh/lib/validations/candidatos.ts`
- Test: `sapatao-rh/lib/validations/candidatos.test.ts`
- Create: `sapatao-rh/app/(app)/candidatos/actions.ts`
- Modify: `sapatao-rh/lib/candidatos/queries.ts` (adiciona `listVagasDistintas` ao fim)

**Interfaces:**
- Produces (schemas): `criarCandidatoSchema` (nome min 2, telefone normalizado só-dígitos 10-15, `vaga_interesse?`, `unidade_id?`, `origem` enum default `outro`, `tags` default `[]`), `atualizarCandidatoSchema` (patch parcial de nome/idade/cep/endereco/tem_veiculo/vaga_interesse/tags/atribuido_a/telefone; objeto vazio é inválido), `ORIGENS` const.
- Produces (actions, guard admin/rh igual a `moverCandidatoAction` de `app/(app)/funil/actions.ts`):
  - `criarCandidato(input): Promise<{ ok: true; candidatoId: string } | { ok?: false; error: string; candidatoId?: string }>` — 23505 → `{ error: "telefone_existente", candidatoId }`.
  - `atualizarCandidato(id, patch): Promise<{ ok: true } | { ok?: false; error: string }>` — telefone SÓ sem conversa (checagem server-side → `telefone_bloqueado`).
  - `iniciarConversa(candidatoId): Promise<{ ok: true; conversationId: string } | { ok?: false; error: string }>` — 23505/corrida → retorna a existente. NÃO envia mensagem. `instance_id` fica null: o fluxo de envio (`app/api/whatsapp/send/route.ts` → `loadContext`) resolve o token pela EMPRESA, não pela conversa.
  - `listarResponsaveis(): Promise<Responsavel[]>` com `type Responsavel = { id: string; nome: string }`.
  - `buscarCandidatosSemConversa(q): Promise<CandidatoBusca[]>` com `type CandidatoBusca = { id: string; nome: string; telefone: string }` (usada pelo dialog "Nova conversa" na Task 6).
- Produces (query): `listVagasDistintas(): Promise<string[]>` (vagas não-nulas distintas da empresa, para autocompletes).
- Consumes: `buscaOr` de `lib/candidatos/filtros.ts`; trigger BEFORE INSERT da migration 0010 (posiciona candidato novo na 1ª etapa do funil padrão — nada a fazer aqui).

- [ ] **Step 1: Teste que falha**

```ts
// lib/validations/candidatos.test.ts
import { describe, it, expect } from "vitest";
import { criarCandidatoSchema, atualizarCandidatoSchema } from "./candidatos";

describe("criarCandidatoSchema", () => {
  it("normaliza telefone para só dígitos", () => {
    const r = criarCandidatoSchema.safeParse({
      nome: "Ana Souza",
      telefone: "(51) 99900-0001",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefone).toBe("51999000001");
  });

  it("aplica defaults: origem outro, tags [], vaga/unidade null", () => {
    const r = criarCandidatoSchema.safeParse({ nome: "Ana Souza", telefone: "5199900000" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.origem).toBe("outro");
      expect(r.data.tags).toEqual([]);
      expect(r.data.vaga_interesse).toBeNull();
      expect(r.data.unidade_id).toBeNull();
    }
  });

  it("rejeita telefone curto (<10 dígitos) e longo (>15)", () => {
    expect(criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "519990" }).success).toBe(false);
    expect(
      criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "1234567890123456" }).success,
    ).toBe(false);
  });

  it("rejeita nome de 1 caractere e origem desconhecida", () => {
    expect(criarCandidatoSchema.safeParse({ nome: "A", telefone: "5199900000" }).success).toBe(false);
    expect(
      criarCandidatoSchema.safeParse({ nome: "Ana", telefone: "5199900000", origem: "tiktok" }).success,
    ).toBe(false);
  });
});

describe("atualizarCandidatoSchema", () => {
  it("aceita patch parcial", () => {
    const r = atualizarCandidatoSchema.safeParse({ idade: 25 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ idade: 25 });
  });

  it("rejeita patch vazio", () => {
    expect(atualizarCandidatoSchema.safeParse({}).success).toBe(false);
  });

  it("atribuido_a: aceita uuid e null, rejeita string qualquer", () => {
    expect(
      atualizarCandidatoSchema.safeParse({ atribuido_a: "0b8e6f0a-1111-4222-8333-444455556666" }).success,
    ).toBe(true);
    expect(atualizarCandidatoSchema.safeParse({ atribuido_a: null }).success).toBe(true);
    expect(atualizarCandidatoSchema.safeParse({ atribuido_a: "eu" }).success).toBe(false);
  });

  it("rejeita idade fora de 14-99 e normaliza telefone", () => {
    expect(atualizarCandidatoSchema.safeParse({ idade: 200 }).success).toBe(false);
    const r = atualizarCandidatoSchema.safeParse({ telefone: "51 99900-0002" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.telefone).toBe("51999000002");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/validations/candidatos.test.ts`
Expected: FAIL — `Cannot find module './candidatos'`.

- [ ] **Step 3: Implementar os schemas**

```ts
// lib/validations/candidatos.ts
import { z } from "zod";

export const ORIGENS = ["indicacao", "presencial", "site", "whatsapp", "outro"] as const;
export type Origem = (typeof ORIGENS)[number];

const telefoneNormalizado = z
  .string()
  .transform((v) => v.replace(/\D/g, ""))
  .refine((d) => d.length >= 10 && d.length <= 15, {
    message: "Telefone deve ter 10 a 15 dígitos (com DDD).",
  });

const tagsSchema = z.array(z.string().trim().min(1).max(30)).max(20);

export const criarCandidatoSchema = z.object({
  nome: z.string().trim().min(2, "Nome muito curto").max(120),
  telefone: telefoneNormalizado,
  vaga_interesse: z.string().trim().min(1).max(80).nullable().default(null),
  unidade_id: z.uuid().nullable().default(null),
  origem: z.enum(ORIGENS).default("outro"),
  tags: tagsSchema.default([]),
});
export type CriarCandidatoInput = z.input<typeof criarCandidatoSchema>;

export const atualizarCandidatoSchema = z
  .object({
    nome: z.string().trim().min(2, "Nome muito curto").max(120),
    idade: z.number().int().min(14).max(99).nullable(),
    cep: z.string().trim().max(9).nullable(),
    endereco: z.string().trim().max(200).nullable(),
    tem_veiculo: z.boolean().nullable(),
    vaga_interesse: z.string().trim().max(80).nullable(),
    tags: tagsSchema,
    atribuido_a: z.uuid().nullable(),
    telefone: telefoneNormalizado,
  })
  .partial()
  .refine((patch) => Object.keys(patch).length > 0, { message: "Nada para atualizar" });
export type AtualizarCandidatoInput = z.input<typeof atualizarCandidatoSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/validations/candidatos.test.ts`
Expected: 9 passed.

- [ ] **Step 5: Server actions**

Criar `app/(app)/candidatos/actions.ts` com o conteúdo completo:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import {
  criarCandidatoSchema,
  atualizarCandidatoSchema,
  type CriarCandidatoInput,
  type AtualizarCandidatoInput,
} from "@/lib/validations/candidatos";
import { buscaOr } from "@/lib/candidatos/filtros";

function canWrite(role: string, platformAdmin: boolean): boolean {
  return platformAdmin || role === "admin" || role === "rh";
}

export type Responsavel = { id: string; nome: string };
export type CandidatoBusca = { id: string; nome: string; telefone: string };

/** Cria um candidato manual (indicação/presencial/etc). O trigger BEFORE INSERT
 *  da 0010 posiciona na 1ª etapa do funil padrão. Telefone duplicado (unique
 *  empresa_id+telefone, 23505) devolve o id existente para a UI oferecer "abrir ficha". */
export async function criarCandidato(
  input: CriarCandidatoInput,
): Promise<{ ok: true; candidatoId: string } | { ok?: false; error: string; candidatoId?: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const parsed = criarCandidatoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido" };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidatos")
    .insert({
      empresa_id: profile.empresa_id,
      nome: parsed.data.nome,
      telefone: parsed.data.telefone,
      vaga_interesse: parsed.data.vaga_interesse,
      unidade_id: parsed.data.unidade_id,
      origem: parsed.data.origem,
      tags: parsed.data.tags,
      status: "ativo",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    // RLS já escopa por empresa; buscamos o dono do telefone para o link "abrir ficha".
    const { data: existente } = await supabase
      .from("candidatos")
      .select("id")
      .eq("telefone", parsed.data.telefone)
      .maybeSingle();
    return { error: "telefone_existente", candidatoId: existente?.id };
  }
  if (error || !data) {
    console.error("[candidatos/actions] criarCandidato:", error);
    return { error: "db" };
  }

  revalidatePath("/candidatos");
  revalidatePath("/funil");
  return { ok: true, candidatoId: data.id };
}

/** Atualiza dados do candidato. Telefone SÓ pode mudar enquanto o candidato não
 *  tem conversa (é a identidade do WhatsApp) — checagem server-side, não só na UI. */
export async function atualizarCandidato(
  candidatoId: string,
  patch: AtualizarCandidatoInput,
): Promise<{ ok: true } | { ok?: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const parsed = atualizarCandidatoSchema.safeParse(patch);
  if (!parsed.success) return { error: "invalido" };

  const supabase = await createClient();

  if (parsed.data.telefone !== undefined) {
    const { data: conversa } = await supabase
      .from("conversations")
      .select("id")
      .eq("candidato_id", candidatoId)
      .maybeSingle();
    if (conversa) return { error: "telefone_bloqueado" };
  }

  const { error } = await supabase.from("candidatos").update(parsed.data).eq("id", candidatoId);
  if (error?.code === "23505") return { error: "telefone_existente" };
  if (error) {
    console.error("[candidatos/actions] atualizarCandidato:", error);
    return { error: "db" };
  }

  revalidatePath("/candidatos");
  revalidatePath(`/candidatos/${candidatoId}`);
  revalidatePath("/funil");
  revalidatePath("/chat");
  return { ok: true };
}

/** Cria a conversa do candidato SEM enviar mensagem (o envio é o fluxo normal do
 *  composer). Corrida/23505 devolve a conversa existente. instance_id fica null:
 *  o envio resolve o token da UAZAPI pela empresa (send/route.ts loadContext). */
export async function iniciarConversa(
  candidatoId: string,
): Promise<{ ok: true; conversationId: string } | { ok?: false; error: string }> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return { error: "forbidden" };

  const supabase = await createClient();

  const { data: candidato } = await supabase
    .from("candidatos")
    .select("id")
    .eq("id", candidatoId)
    .maybeSingle();
  if (!candidato) return { error: "not_found" };

  const { data: existente } = await supabase
    .from("conversations")
    .select("id")
    .eq("candidato_id", candidatoId)
    .maybeSingle();
  if (existente) return { ok: true, conversationId: existente.id };

  const { data, error } = await supabase
    .from("conversations")
    .insert({
      empresa_id: profile.empresa_id,
      candidato_id: candidatoId,
      status: "aberta",
    })
    .select("id")
    .single();

  if (error?.code === "23505") {
    const { data: corrida } = await supabase
      .from("conversations")
      .select("id")
      .eq("candidato_id", candidatoId)
      .maybeSingle();
    if (corrida) return { ok: true, conversationId: corrida.id };
  }
  if (error || !data) {
    console.error("[candidatos/actions] iniciarConversa:", error);
    return { error: "db" };
  }

  revalidatePath("/chat");
  return { ok: true, conversationId: data.id };
}

/** Profiles ativos da empresa com papel admin/rh (selects de responsável). */
export async function listarResponsaveis(): Promise<Responsavel[]> {
  const profile = await getCurrentProfile();
  if (!profile) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome")
    .in("role", ["admin", "rh"])
    .eq("ativo", true)
    .order("nome");
  if (error) {
    console.error("[candidatos/actions] listarResponsaveis:", error);
    return [];
  }
  return (data ?? []) as Responsavel[];
}

/** Busca candidatos SEM conversa por nome/telefone (dialog "Nova conversa"). */
export async function buscarCandidatosSemConversa(q: string): Promise<CandidatoBusca[]> {
  const profile = await getCurrentProfile();
  if (!profile || !canWrite(profile.role, profile.platform_admin)) return [];
  const termo = q.trim().slice(0, 80);
  if (termo.length < 2) return [];

  const supabase = await createClient();
  let query = supabase
    .from("candidatos")
    .select("id, nome, telefone, conversations(id)")
    .order("updated_at", { ascending: false })
    .limit(20);
  const or = buscaOr(termo);
  if (or) query = query.or(or);

  const { data, error } = await query;
  if (error) {
    console.error("[candidatos/actions] buscarCandidatosSemConversa:", error);
    return [];
  }
  type Row = CandidatoBusca & { conversations: { id: string }[] | null };
  return ((data ?? []) as unknown as Row[])
    .filter((r) => !r.conversations || r.conversations.length === 0)
    .slice(0, 10)
    .map(({ id, nome, telefone }) => ({ id, nome, telefone }));
}
```

- [ ] **Step 6: `listVagasDistintas` em `lib/candidatos/queries.ts`**

Adicionar ao FIM do arquivo:

```ts
/** Vagas de interesse distintas (não nulas) da empresa, para autocompletes. */
export async function listVagasDistintas(): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("candidatos")
    .select("vaga_interesse")
    .not("vaga_interesse", "is", null)
    .order("vaga_interesse");
  if (error) {
    console.error("[candidatos/queries] listVagasDistintas error:", error);
    return [];
  }
  const set = new Set<string>();
  for (const r of (data ?? []) as { vaga_interesse: string | null }[]) {
    const v = r.vaga_interesse?.trim();
    if (v) set.add(v);
  }
  return [...set];
}
```

- [ ] **Step 7: Suíte + tsc + commit**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit
```
Expected: 253 passed (244 + 9); tsc sem erros.

```bash
git add sapatao-rh/lib/validations/candidatos.ts sapatao-rh/lib/validations/candidatos.test.ts "sapatao-rh/app/(app)/candidatos/actions.ts" sapatao-rh/lib/candidatos/queries.ts
git commit -m "feat(sp6): schemas de candidato + actions criar/atualizar/iniciarConversa/responsaveis"
```

---

### Task 3: `NovoCandidatoDialog` + botão "Novo candidato" em /candidatos e /funil

**Files:**
- Create: `sapatao-rh/components/candidatos/novo-candidato-dialog.tsx`
- Modify: `sapatao-rh/app/(app)/candidatos/page.tsx` (header + carga de vagas/unidades)
- Modify: `sapatao-rh/app/(app)/funil/page.tsx` (ganha header com o botão — arquivo completo abaixo)

**Interfaces:**
- Produces (props): `NovoCandidatoDialog({ vagas: string[]; unidades: { id: string; nome: string }[]; aoCriar?: "ficha" | "refresh"; open?: boolean; onOpenChange?: (o: boolean) => void; withTrigger?: boolean; onCreated?: (candidatoId: string) => void })` — `aoCriar` é serializável (server pages não podem passar callback); `onCreated` sobrepõe a navegação (uso client→client na Task 6).
- Consumes: `criarCandidato`, `ORIGENS` (Task 2).

- [ ] **Step 1: Criar `components/candidatos/novo-candidato-dialog.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { UserRoundPlus } from "lucide-react";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { criarCandidato } from "@/app/(app)/candidatos/actions";
import { ORIGENS, type Origem } from "@/lib/validations/candidatos";

const ORIGEM_LABEL: Record<Origem, string> = {
  indicacao: "Indicação",
  presencial: "Presencial",
  site: "Site",
  whatsapp: "WhatsApp",
  outro: "Outro",
};

const SEM_UNIDADE = "nenhuma";

/** Dialog de cadastro manual de candidato (lead de indicação/presencial).
 *  Usado no header de /candidatos, no header do /funil e dentro do "Nova conversa". */
export function NovoCandidatoDialog({
  vagas,
  unidades,
  aoCriar = "ficha",
  open: openProp,
  onOpenChange,
  withTrigger = true,
  onCreated,
}: {
  vagas: string[];
  unidades: { id: string; nome: string }[];
  /** Navegação padrão no sucesso (server pages não podem passar callback). */
  aoCriar?: "ficha" | "refresh";
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
  withTrigger?: boolean;
  /** Sobrepõe a navegação padrão (uso client→client, ex.: Nova conversa). */
  onCreated?: (candidatoId: string) => void;
}) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = onOpenChange ?? setOpenState;

  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [vaga, setVaga] = useState("");
  const [unidadeId, setUnidadeId] = useState<string | null>(null);
  const [origem, setOrigem] = useState<Origem>("outro");
  const [tags, setTags] = useState("");
  const [pending, setPending] = useState(false);
  const [duplicado, setDuplicado] = useState<{ id: string | null } | null>(null);

  function reset() {
    setNome("");
    setTelefone("");
    setVaga("");
    setUnidadeId(null);
    setOrigem("outro");
    setTags("");
    setDuplicado(null);
  }

  async function submit() {
    setPending(true);
    setDuplicado(null);
    try {
      const r = await criarCandidato({
        nome,
        telefone,
        vaga_interesse: vaga.trim() || null,
        unidade_id: unidadeId,
        origem,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      });
      if (r.ok) {
        toast.success("Candidato cadastrado.");
        setOpen(false);
        reset();
        if (onCreated) onCreated(r.candidatoId);
        else if (aoCriar === "ficha") router.push(`/candidatos/${r.candidatoId}`);
        else router.refresh();
        return;
      }
      if (r.error === "telefone_existente") {
        setDuplicado({ id: r.candidatoId ?? null });
        return;
      }
      toast.error(
        r.error === "invalido"
          ? "Confira nome (mín. 2 letras) e telefone (10 a 15 dígitos)."
          : r.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao cadastrar o candidato.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      {withTrigger && (
        <Button
          size="sm"
          onClick={() => {
            reset();
            setOpen(true);
          }}
        >
          <UserRoundPlus className="size-3.5" />
          Novo candidato
        </Button>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDuplicado(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo candidato</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="mb-1">Telefone (com DDD)</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                placeholder="51 99900-0000"
                inputMode="tel"
              />
            </div>
            <div>
              <Label className="mb-1">Vaga de interesse</Label>
              <Input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                list="sp6-vagas-sugeridas"
                placeholder="ex.: Atendente"
                maxLength={80}
              />
              <datalist id="sp6-vagas-sugeridas">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1">Origem</Label>
                <Select
                  value={origem}
                  onValueChange={(v: string | null) => setOrigem((v as Origem) ?? "outro")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORIGENS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {ORIGEM_LABEL[o]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {unidades.length > 0 && (
                <div className="flex-1">
                  <Label className="mb-1">Unidade</Label>
                  <Select
                    value={unidadeId ?? SEM_UNIDADE}
                    onValueChange={(v: string | null) =>
                      setUnidadeId(v === SEM_UNIDADE ? null : v)
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SEM_UNIDADE}>Sem unidade</SelectItem>
                      {unidades.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div>
              <Label className="mb-1">Tags (separadas por vírgula)</Label>
              <Input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="ex.: manhã, cnh-b"
              />
            </div>

            {duplicado && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800">
                Já existe um candidato com este telefone.{" "}
                {duplicado.id ? (
                  <Link
                    href={`/candidatos/${duplicado.id}`}
                    className="font-semibold underline"
                    onClick={() => setOpen(false)}
                  >
                    Abrir ficha existente
                  </Link>
                ) : (
                  "Procure-o na lista de candidatos."
                )}
              </p>
            )}
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim() || !telefone.trim()}>
              {pending ? "Salvando…" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Botão no header de `/candidatos`**

Em `app/(app)/candidatos/page.tsx`, trocar o bloco de imports (linhas 1-13) por:

```tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { Users } from "lucide-react";
import { PageContainer } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { FiltrosBar } from "@/components/candidatos/filtros-bar";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";
import { CandidatosTabela, type EtapaInfo } from "@/components/candidatos/tabela";
import { PaginacaoNav } from "@/components/candidatos/paginacao-nav";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas } from "@/lib/funil/queries";
import { parseFiltros } from "@/lib/candidatos/filtros";
import { listCandidatos, listVagasDistintas } from "@/lib/candidatos/queries";
import { totalPaginas, resumoPaginacao } from "@/lib/candidatos/paginacao";
import { createClient } from "@/lib/supabase/server";
```

Trocar:

```tsx
  const [funil, lista] = await Promise.all([getFunilComEtapas(), listCandidatos(filtros)]);
  const etapas = funil?.etapas ?? [];
```

por:

```tsx
  const supabase = await createClient();
  const [funil, lista, vagas, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listCandidatos(filtros),
    listVagasDistintas(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];
  const canCreate = profile.platform_admin || profile.role === "admin" || profile.role === "rh";
  const etapas = funil?.etapas ?? [];
```

E trocar o header:

```tsx
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Candidatos</h1>
        <p className="text-sm text-neutro-700">
          Base completa de quem já se candidatou — inclui contratados, reprovados e desistentes.
        </p>
      </div>
```

por:

```tsx
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold">Candidatos</h1>
          <p className="text-sm text-neutro-700">
            Base completa de quem já se candidatou — inclui contratados, reprovados e desistentes.
          </p>
        </div>
        {canCreate && <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="ficha" />}
      </div>
```

- [ ] **Step 3: Header do `/funil` com o botão**

Substituir `app/(app)/funil/page.tsx` INTEIRO por (a Task 9 evolui este arquivo — os filtros ainda não entram aqui):

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listCandidatosDoFunil } from "@/lib/funil/queries";
import { listVagasDistintas } from "@/lib/candidatos/queries";
import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/funil/board";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";

export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const { u } = await searchParams;
  const unidadeId = typeof u === "string" ? u : null;

  const supabase = await createClient();
  const [funil, vagas, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listVagasDistintas(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];

  if (!funil || funil.etapas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutro-700">
        Nenhum funil configurado para esta empresa.
      </div>
    );
  }

  const etapaIds = funil.etapas.map((e) => e.id);
  const candidatos = await listCandidatosDoFunil(etapaIds, unidadeId);
  const canMove = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutro-200 bg-card px-4 py-2.5">
        <h1 className="font-display text-lg font-bold">Funil</h1>
        {canMove && <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="refresh" />}
      </div>
      <div className="min-h-0 flex-1">
        <Board
          etapas={funil.etapas}
          candidatos={candidatos}
          empresaId={profile.empresa_id}
          canMove={canMove}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Suíte + tsc + lint + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 253 passed; tsc/lint sem erros.

Smoke (supabase local + `npm run dev` no ar, logado como admin):
1. `/candidatos` → "Novo candidato" → cadastrar "Teste Manual SP6" telefone `51999001234`, origem Indicação → toast + navega para a ficha; candidato aparece na 1ª etapa do funil.
2. Repetir com o MESMO telefone → alerta inline "Já existe..." com link "Abrir ficha existente".
3. `/funil` → botão no header cadastra e o board reflete (refresh) o card na 1ª coluna.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/components/candidatos/novo-candidato-dialog.tsx "sapatao-rh/app/(app)/candidatos/page.tsx" "sapatao-rh/app/(app)/funil/page.tsx"
git commit -m "feat(sp6): dialog novo candidato nos headers de candidatos e funil"
```

---

### Task 4: `EditarCandidatoDialog` compartilhado + integração na ficha

**Files:**
- Create: `sapatao-rh/components/candidatos/editar-candidato-dialog.tsx`
- Modify: `sapatao-rh/components/candidatos/ficha-acoes.tsx` (novas props + renderiza o dialog)
- Modify: `sapatao-rh/app/(app)/candidatos/[id]/page.tsx` (carrega vagas/responsáveis e repassa)

**Interfaces:**
- Produces: `type CandidatoEditavel = Pick<Candidato, "id" | "nome" | "idade" | "cep" | "endereco" | "tem_veiculo" | "telefone" | "vaga_interesse" | "tags" | "atribuido_a">`
- Produces (props): `EditarCandidatoDialog({ candidato: CandidatoEditavel; temConversa: boolean; vagas: string[]; responsaveis: Responsavel[] })` — dialog com trigger próprio ("Editar dados"); telefone travado quando `temConversa`.
- Modifies (props de `FichaAcoes`): ganha `candidato: CandidatoEditavel; vagas: string[]; responsaveis: Responsavel[]`.
- Consumes: `atualizarCandidato`, `Responsavel` (Task 2), `listVagasDistintas`, `listarResponsaveis`.

- [ ] **Step 1: Criar `components/candidatos/editar-candidato-dialog.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { atualizarCandidato, type Responsavel } from "@/app/(app)/candidatos/actions";
import type { Candidato } from "@/types/database";

export type CandidatoEditavel = Pick<
  Candidato,
  | "id"
  | "nome"
  | "idade"
  | "cep"
  | "endereco"
  | "tem_veiculo"
  | "telefone"
  | "vaga_interesse"
  | "tags"
  | "atribuido_a"
>;

const NINGUEM = "ninguem";
type Veiculo = "sim" | "nao" | "nd";

/** Dialog compartilhado (ficha + painel do chat) para editar dados do candidato.
 *  Telefone fica TRAVADO quando já existe conversa (identidade do WhatsApp) —
 *  o server (atualizarCandidato) também bloqueia (telefone_bloqueado). */
export function EditarCandidatoDialog({
  candidato,
  temConversa,
  vagas,
  responsaveis,
}: {
  candidato: CandidatoEditavel;
  temConversa: boolean;
  vagas: string[];
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState(candidato.nome);
  const [idade, setIdade] = useState(candidato.idade != null ? String(candidato.idade) : "");
  const [cep, setCep] = useState(candidato.cep ?? "");
  const [endereco, setEndereco] = useState(candidato.endereco ?? "");
  const [temVeiculo, setTemVeiculo] = useState<Veiculo>(
    candidato.tem_veiculo === null ? "nd" : candidato.tem_veiculo ? "sim" : "nao",
  );
  const [telefone, setTelefone] = useState(candidato.telefone);
  const [vaga, setVaga] = useState(candidato.vaga_interesse ?? "");
  const [tags, setTags] = useState(candidato.tags.join(", "));
  const [atribuidoA, setAtribuidoA] = useState<string>(candidato.atribuido_a ?? NINGUEM);

  function reset() {
    setNome(candidato.nome);
    setIdade(candidato.idade != null ? String(candidato.idade) : "");
    setCep(candidato.cep ?? "");
    setEndereco(candidato.endereco ?? "");
    setTemVeiculo(candidato.tem_veiculo === null ? "nd" : candidato.tem_veiculo ? "sim" : "nao");
    setTelefone(candidato.telefone);
    setVaga(candidato.vaga_interesse ?? "");
    setTags(candidato.tags.join(", "));
    setAtribuidoA(candidato.atribuido_a ?? NINGUEM);
  }

  async function submit() {
    setPending(true);
    try {
      const idadeNum = idade.trim() === "" ? null : Number(idade);
      const r = await atualizarCandidato(candidato.id, {
        nome,
        idade: idadeNum !== null && Number.isNaN(idadeNum) ? null : idadeNum,
        cep: cep.trim() || null,
        endereco: endereco.trim() || null,
        tem_veiculo: temVeiculo === "nd" ? null : temVeiculo === "sim",
        vaga_interesse: vaga.trim() || null,
        tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
        atribuido_a: atribuidoA === NINGUEM ? null : atribuidoA,
        ...(temConversa ? {} : { telefone }),
      });
      if (r.ok) {
        toast.success("Dados atualizados.");
        setOpen(false);
        router.refresh();
        return;
      }
      toast.error(
        r.error === "telefone_bloqueado"
          ? "O telefone é a identidade do WhatsApp após a 1ª conversa — não pode mudar."
          : r.error === "telefone_existente"
            ? "Já existe outro candidato com este telefone."
            : r.error === "invalido"
              ? "Confira os campos (idade 14–99, telefone 10–15 dígitos)."
              : r.error === "forbidden"
                ? "Sem permissão."
                : "Erro ao salvar.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Editar dados
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar dados do candidato</DialogTitle>
          </DialogHeader>

          <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} />
            </div>
            <div>
              <Label className="mb-1">Telefone</Label>
              <Input
                value={telefone}
                onChange={(e) => setTelefone(e.target.value)}
                disabled={temConversa}
                title={
                  temConversa
                    ? "Telefone é a identidade do WhatsApp após a 1ª conversa."
                    : undefined
                }
                inputMode="tel"
              />
              {temConversa && (
                <p className="mt-1 text-xs text-neutro-500">
                  Travado: telefone é a identidade do WhatsApp após a 1ª conversa.
                </p>
              )}
            </div>
            <div className="flex gap-3">
              <div className="w-24">
                <Label className="mb-1">Idade</Label>
                <Input
                  type="number"
                  min={14}
                  max={99}
                  value={idade}
                  onChange={(e) => setIdade(e.target.value)}
                />
              </div>
              <div className="flex-1">
                <Label className="mb-1">CEP</Label>
                <Input value={cep} onChange={(e) => setCep(e.target.value)} maxLength={9} />
              </div>
            </div>
            <div>
              <Label className="mb-1">Endereço</Label>
              <Input
                value={endereco}
                onChange={(e) => setEndereco(e.target.value)}
                maxLength={200}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <Label className="mb-1">Veículo próprio</Label>
                <Select
                  value={temVeiculo}
                  onValueChange={(v: string | null) => setTemVeiculo((v as Veiculo) ?? "nd")}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="nd">Não informado</SelectItem>
                    <SelectItem value="sim">Sim</SelectItem>
                    <SelectItem value="nao">Não</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="mb-1">Responsável</Label>
                <Select
                  value={atribuidoA}
                  onValueChange={(v: string | null) => setAtribuidoA(v ?? NINGUEM)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                    {responsaveis.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="mb-1">Vaga de interesse</Label>
              <Input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                list="sp6-vagas-editar"
                maxLength={80}
              />
              <datalist id="sp6-vagas-editar">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="mb-1">Tags (separadas por vírgula)</Label>
              <Input value={tags} onChange={(e) => setTags(e.target.value)} />
            </div>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: `FichaAcoes` ganha o dialog**

Em `components/candidatos/ficha-acoes.tsx`, trocar o bloco de imports do topo (linhas 15-18):

```tsx
import { AgendarDialog } from "@/components/funil/agendar-dialog";
import { ConfirmMoveDialog } from "@/components/funil/confirm-move-dialog";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import type { FunilEtapa } from "@/types/database";
```

por:

```tsx
import { AgendarDialog } from "@/components/funil/agendar-dialog";
import { ConfirmMoveDialog } from "@/components/funil/confirm-move-dialog";
import {
  EditarCandidatoDialog,
  type CandidatoEditavel,
} from "@/components/candidatos/editar-candidato-dialog";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import type { Responsavel } from "@/app/(app)/candidatos/actions";
import type { FunilEtapa } from "@/types/database";
```

Trocar a assinatura (props):

```tsx
export function FichaAcoes({
  candidatoId,
  nome,
  etapaId,
  conversationId,
  etapas,
  canEdit,
  temEntrevista,
}: {
  candidatoId: string;
  nome: string;
  etapaId: string | null;
  conversationId: string | null;
  etapas: FunilEtapa[];
  canEdit: boolean;
  temEntrevista: boolean;
}) {
```

por:

```tsx
export function FichaAcoes({
  candidatoId,
  nome,
  etapaId,
  conversationId,
  etapas,
  canEdit,
  temEntrevista,
  candidato,
  vagas,
  responsaveis,
}: {
  candidatoId: string;
  nome: string;
  etapaId: string | null;
  conversationId: string | null;
  etapas: FunilEtapa[];
  canEdit: boolean;
  temEntrevista: boolean;
  candidato: CandidatoEditavel;
  vagas: string[];
  responsaveis: Responsavel[];
}) {
```

E logo APÓS o `<Button ...>Abrir conversa</Button>` (fechamento `</Button>` na linha 79), inserir:

```tsx
      {canEdit && (
        <EditarCandidatoDialog
          candidato={candidato}
          temConversa={!!conversationId}
          vagas={vagas}
          responsaveis={responsaveis}
        />
      )}
```

- [ ] **Step 3: Ficha carrega e repassa vagas/responsáveis**

Em `app/(app)/candidatos/[id]/page.tsx`, trocar:

```tsx
import { getCandidatoFicha, getEntrevistaVigente } from "@/lib/candidatos/queries";
import type { Entrevista } from "@/types/database";
```

por:

```tsx
import { getCandidatoFicha, getEntrevistaVigente, listVagasDistintas } from "@/lib/candidatos/queries";
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import type { Entrevista } from "@/types/database";
```

Trocar:

```tsx
  const [candidato, funil, historico, entrevista] = await Promise.all([
    getCandidatoFicha(id),
    getFunilComEtapas(),
    getHistorico(id),
    getEntrevistaVigente(id) as Promise<Entrevista | null>,
  ]);
```

por:

```tsx
  const [candidato, funil, historico, entrevista, vagas, responsaveis] = await Promise.all([
    getCandidatoFicha(id),
    getFunilComEtapas(),
    getHistorico(id),
    getEntrevistaVigente(id) as Promise<Entrevista | null>,
    listVagasDistintas(),
    listarResponsaveis(),
  ]);
```

E trocar a chamada:

```tsx
        <FichaAcoes
          candidatoId={candidato.id}
          nome={candidato.nome}
          etapaId={candidato.etapa_id}
          conversationId={candidato.conversationId}
          etapas={etapas}
          canEdit={canEdit}
          temEntrevista={!!entrevista}
        />
```

por:

```tsx
        <FichaAcoes
          candidatoId={candidato.id}
          nome={candidato.nome}
          etapaId={candidato.etapa_id}
          conversationId={candidato.conversationId}
          etapas={etapas}
          canEdit={canEdit}
          temEntrevista={!!entrevista}
          candidato={candidato}
          vagas={vagas}
          responsaveis={responsaveis}
        />
```

(`candidato` é `CandidatoFicha = Candidato & {...}` — estruturalmente compatível com `CandidatoEditavel`.)

- [ ] **Step 4: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 253 passed; tsc/lint sem erros.

Smoke: abrir a ficha do candidato criado na Task 3 → "Editar dados" → mudar idade/vaga/responsável → Salvar → toast + página reflete. Candidato COM conversa (um lead de WhatsApp existente): campo telefone desabilitado com a nota do tooltip; candidato SEM conversa: telefone editável.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/components/candidatos/editar-candidato-dialog.tsx sapatao-rh/components/candidatos/ficha-acoes.tsx "sapatao-rh/app/(app)/candidatos/[id]/page.tsx"
git commit -m "feat(sp6): dialog editar dados do candidato + integracao na ficha"
```

---

### Task 5: Painel de ação no chat (etapa, tags, vaga, responsável, editar dados)

**Files:**
- Modify: `sapatao-rh/components/chat/candidate-panel.tsx` (REESCRITA — vira client component com ações)
- Modify: `sapatao-rh/app/(app)/chat/page.tsx` (REESCRITA — carrega etapas/vagas/responsáveis e repassa)

**Interfaces:**
- Modifies (props de `CandidatePanel`): `{ candidato: Candidato; etapas: FunilEtapa[]; vagas: string[]; responsaveis: Responsavel[]; canEdit: boolean }`.
- Consumes: `moverCandidatoAction` (confirmação nas etapas `requires_confirm` — mesmo padrão de `candidate-modal.tsx`), `atualizarCandidato`, `EditarCandidatoDialog` (Task 4), `ConfirmMoveDialog`, `getFunilComEtapas`, `listVagasDistintas`, `listarResponsaveis`.
- Substitui o campo-texto legado `etapa` (spec §5) pelo select de `etapa_id`.

- [ ] **Step 1: Reescrever `components/chat/candidate-panel.tsx`**

Substituir o arquivo INTEIRO por:

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ConfirmMoveDialog } from "@/components/funil/confirm-move-dialog";
import { EditarCandidatoDialog } from "@/components/candidatos/editar-candidato-dialog";
import { ParecerView } from "@/components/cv/parecer-view";
import { moverCandidatoAction } from "@/app/(app)/funil/actions";
import {
  atualizarCandidato,
  type Responsavel,
  type AtualizarPatch,
} from "@/app/(app)/candidatos/actions";
import type { Candidato, FunilEtapa } from "@/types/database";

const NINGUEM = "ninguem";

interface Props {
  candidato: Candidato;
  etapas: FunilEtapa[];
  vagas: string[];
  responsaveis: Responsavel[];
  canEdit: boolean;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt className="text-xs font-medium text-neutro-700">{label}</dt>
      <dd className="mt-0.5 text-sm text-neutro-900">{value}</dd>
    </div>
  );
}

/** Painel de AÇÃO do chat (spec §5): triagem completa sem sair da conversa —
 *  etapa (com confirmação nas críticas), tags, vaga, responsável e dados. */
export function CandidatePanel({ candidato, etapas, vagas, responsaveis, canEdit }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirmEtapa, setConfirmEtapa] = useState<FunilEtapa | null>(null);

  // Estado local com render-time sync (padrão do Board): re-inicializa quando o
  // server manda um candidato novo (troca de conversa ou router.refresh).
  const [tags, setTags] = useState(candidato.tags);
  const [novaTag, setNovaTag] = useState("");
  const [vaga, setVaga] = useState(candidato.vaga_interesse ?? "");
  const [snapshot, setSnapshot] = useState(candidato);
  if (snapshot !== candidato) {
    setSnapshot(candidato);
    setTags(candidato.tags);
    setVaga(candidato.vaga_interesse ?? "");
    setNovaTag("");
  }

  const salvar = (patch: AtualizarPatch, okMsg: string) => {
    startTransition(async () => {
      const r = await atualizarCandidato(candidato.id, patch);
      if (r.ok) {
        toast.success(okMsg);
        router.refresh();
      } else {
        toast.error("Não foi possível salvar.");
      }
    });
  };

  const addTag = () => {
    const t = novaTag.trim();
    setNovaTag("");
    if (!t || tags.includes(t)) return;
    const novas = [...tags, t];
    setTags(novas);
    salvar({ tags: novas }, "Tag adicionada.");
  };

  const removeTag = (t: string) => {
    const novas = tags.filter((x) => x !== t);
    setTags(novas);
    salvar({ tags: novas }, "Tag removida.");
  };

  const salvarVaga = () => {
    const v = vaga.trim();
    if (v === (candidato.vaga_interesse ?? "")) return;
    salvar({ vaga_interesse: v || null }, "Vaga atualizada.");
  };

  // Mesmo gate do modal do funil: etapas requires_confirm pedem confirmação.
  const doMove = (paraEtapaId: string) => {
    startTransition(async () => {
      const r = await moverCandidatoAction({ candidatoId: candidato.id, paraEtapaId });
      if (r.ok) {
        toast.success("Candidato movido.");
        router.refresh();
      } else {
        toast.error("Não foi possível mover o candidato.");
      }
    });
  };

  const onMover = (paraEtapaId: string | null) => {
    if (!paraEtapaId || paraEtapaId === candidato.etapa_id) return;
    const etapa = etapas.find((e) => e.id === paraEtapaId);
    if (etapa?.requires_confirm) {
      setConfirmEtapa(etapa);
      return;
    }
    doMove(paraEtapaId);
  };

  return (
    <div className="flex h-full flex-col overflow-y-auto border-l border-neutro-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-neutro-200 p-4">
        <h3 className="font-display text-sm font-semibold text-neutro-900">Candidato</h3>
        <div className="flex items-center gap-3">
          <Link href="/funil" className="text-xs font-medium text-brand-700 hover:underline">
            Ver no funil
          </Link>
          <Link
            href={`/candidatos/${candidato.id}`}
            className="text-xs font-medium text-brand-700 hover:underline"
          >
            Ver ficha
          </Link>
        </div>
      </div>

      <div className="flex-1 space-y-5 p-4">
        {/* Dados básicos */}
        <dl className="space-y-3">
          <InfoRow label="Nome" value={candidato.nome} />
          <InfoRow label="Telefone" value={candidato.telefone} />
          <InfoRow label="Status" value={candidato.status} />
        </dl>

        {/* Etapa do funil */}
        {etapas.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-neutro-700">Etapa do funil</p>
            {canEdit ? (
              <Select value={candidato.etapa_id} onValueChange={onMover}>
                <SelectTrigger size="sm" className="w-full" disabled={pending}>
                  <SelectValue placeholder="Sem etapa" />
                </SelectTrigger>
                <SelectContent>
                  {etapas.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-neutro-900">
                {etapas.find((e) => e.id === candidato.etapa_id)?.nome ?? "—"}
              </p>
            )}
          </div>
        )}

        {/* Vaga (autocomplete) */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutro-700">Vaga de interesse</p>
          {canEdit ? (
            <>
              <input
                value={vaga}
                onChange={(e) => setVaga(e.target.value)}
                onBlur={salvarVaga}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
                list="sp6-vagas-painel"
                disabled={pending}
                placeholder="ex.: Atendente"
                className="h-8 w-full rounded-md border border-neutro-200 bg-neutro-50 px-2.5 text-sm text-neutro-900 placeholder:text-neutro-500 focus:border-sapatao-verde focus:outline-none disabled:opacity-50"
              />
              <datalist id="sp6-vagas-painel">
                {vagas.map((v) => (
                  <option key={v} value={v} />
                ))}
              </datalist>
            </>
          ) : (
            <p className="text-sm text-neutro-900">{candidato.vaga_interesse ?? "—"}</p>
          )}
        </div>

        {/* Responsável */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutro-700">Responsável</p>
          {canEdit ? (
            <Select
              value={candidato.atribuido_a ?? NINGUEM}
              onValueChange={(v: string | null) =>
                salvar(
                  { atribuido_a: v === NINGUEM || v === null ? null : v },
                  "Responsável atualizado.",
                )
              }
            >
              <SelectTrigger size="sm" className="w-full" disabled={pending}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NINGUEM}>Ninguém</SelectItem>
                {responsaveis.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <p className="text-sm text-neutro-900">
              {responsaveis.find((r) => r.id === candidato.atribuido_a)?.nome ?? "Ninguém"}
            </p>
          )}
        </div>

        {/* Tags (chips editáveis) */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-neutro-700">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 rounded-full border border-neutro-200 bg-neutro-50 px-2 py-0.5 text-xs text-neutro-900"
              >
                {tag}
                {canEdit && (
                  <button
                    type="button"
                    aria-label={`Remover tag ${tag}`}
                    onClick={() => removeTag(tag)}
                    disabled={pending}
                    className="text-neutro-500 hover:text-neutro-900 disabled:opacity-50"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {tags.length === 0 && !canEdit && (
              <span className="text-xs text-neutro-500">Sem tags</span>
            )}
          </div>
          {canEdit && (
            <input
              value={novaTag}
              onChange={(e) => setNovaTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addTag();
                }
              }}
              disabled={pending}
              placeholder="Nova tag + Enter"
              className="mt-1.5 h-7 w-full rounded-md border border-neutro-200 bg-neutro-50 px-2.5 text-xs text-neutro-900 placeholder:text-neutro-500 focus:border-sapatao-verde focus:outline-none disabled:opacity-50"
            />
          )}
        </div>

        {/* Editar dados */}
        {canEdit && (
          <EditarCandidatoDialog
            candidato={candidato}
            temConversa
            vagas={vagas}
            responsaveis={responsaveis}
          />
        )}

        {/* Notas internas */}
        {candidato.notas_internas && (
          <div>
            <p className="mb-1 text-xs font-medium text-neutro-700">Notas internas</p>
            <p className="whitespace-pre-wrap text-sm text-neutro-900">
              {candidato.notas_internas}
            </p>
          </div>
        )}

        {/* Análise de IA */}
        <div className="rounded-lg border border-neutro-200 bg-neutro-50 p-3">
          <p className="mb-2 text-xs font-medium text-neutro-700">Análise de IA</p>
          <ParecerView parecer={candidato.parecer_ia} score={candidato.score_ia} />
        </div>
      </div>

      {confirmEtapa && (
        <ConfirmMoveDialog
          open={!!confirmEtapa}
          onOpenChange={(o) => {
            if (!o) setConfirmEtapa(null);
          }}
          nome={candidato.nome}
          etapaNome={confirmEtapa.nome}
          onConfirm={() => {
            doMove(confirmEtapa.id);
            setConfirmEtapa(null);
          }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Exportar o tipo do patch na action**

O painel usa `AtualizarPatch`. Em `app/(app)/candidatos/actions.ts` (Task 2), logo após a linha exata `export type CandidatoBusca = { id: string; nome: string; telefone: string };`, adicionar:

```ts
export type AtualizarPatch = AtualizarCandidatoInput;
```

(Arquivos `"use server"` só exportam funções async E tipos — type re-export é permitido.)

- [ ] **Step 3: Reescrever `app/(app)/chat/page.tsx`**

Substituir o arquivo INTEIRO por (Tasks 6/7/10 evoluem este arquivo com edits ancorados):

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import {
  listConversations,
  loadThread,
  loadCandidato,
  getEmpresaId,
  type ThreadResult,
} from "@/lib/chat/queries";
import { getFunilComEtapas } from "@/lib/funil/queries";
import { listVagasDistintas } from "@/lib/candidatos/queries";
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import { ConversationList } from "@/components/chat/conversation-list";
import { MessageThread } from "@/components/chat/message-thread";
import { CandidatePanel } from "@/components/chat/candidate-panel";
import { ChatRealtime } from "@/components/chat/realtime";
import { MarkRead } from "@/components/chat/mark-read";
import type { Candidato } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  const canEdit = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  const { c } = await searchParams;
  const activeConversationId = typeof c === "string" ? c : null;

  const [empresaId, conversations, funil, vagas, responsaveis] = await Promise.all([
    getEmpresaId(),
    listConversations(),
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
  ]);

  // Default to the first conversation when none is explicitly selected.
  const displayedConvId = activeConversationId ?? conversations[0]?.id ?? null;
  const displayedConv = displayedConvId
    ? conversations.find((conv) => conv.id === displayedConvId)
    : undefined;

  // Load the displayed conversation's thread + the real candidato record.
  let thread: ThreadResult = { messages: [], hasMore: false };
  let activeCandidato: Candidato | null = null;
  if (displayedConv) {
    const [threadResult, candidato] = await Promise.all([
      loadThread(displayedConv.id),
      loadCandidato(displayedConv.candidato_id),
    ]);
    thread = threadResult;
    activeCandidato = candidato;
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Column 1 — Conversation list (280px) */}
      <div className="w-[280px] shrink-0">
        <ConversationList conversations={conversations} activeId={displayedConvId} />
      </div>

      {/* Column 2 — Message thread (flex-1) */}
      <div className="flex min-w-0 flex-1 flex-col">
        {displayedConvId ? (
          <MessageThread
            key={displayedConvId}
            messages={thread.messages}
            hasMore={thread.hasMore}
            conversationId={displayedConvId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-neutro-700">
            Selecione uma conversa para começar.
          </div>
        )}
      </div>

      {/* Column 3 — Candidate ACTION panel (260px) */}
      {activeCandidato && (
        <div className="w-[260px] shrink-0">
          <CandidatePanel
            candidato={activeCandidato}
            etapas={funil?.etapas ?? []}
            vagas={vagas}
            responsaveis={responsaveis}
            canEdit={canEdit}
          />
        </div>
      )}

      {/* Realtime subscription + mark-read on open */}
      {empresaId && <ChatRealtime empresaId={empresaId} />}
      {displayedConvId && <MarkRead conversationId={displayedConvId} />}
    </div>
  );
}
```

- [ ] **Step 4: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 253 passed; tsc/lint sem erros.

Smoke em `/chat` com uma conversa aberta:
1. Painel direito mostra selects de Etapa/Responsável, input de Vaga, chips de Tags e o botão "Editar dados".
2. Mover para etapa comum → toast "Candidato movido." e `/funil` reflete; mover para etapa crítica (ex.: Reprovado) → ConfirmMoveDialog antes.
3. Adicionar tag via Enter e remover via ×; trocar vaga (blur) e responsável → toasts + persistência após F5.
4. "Ver no funil" navega para `/funil`.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/components/chat/candidate-panel.tsx "sapatao-rh/app/(app)/chat/page.tsx" "sapatao-rh/app/(app)/candidatos/actions.ts"
git commit -m "feat(sp6): painel de acao no chat - etapa, tags, vaga, responsavel, editar dados"
```

---

### Task 6: Iniciar conversa (ficha, modal do funil e "Nova conversa" na Central)

**Files:**
- Modify: `sapatao-rh/components/candidatos/ficha-acoes.tsx` (troca "Abrir conversa" desabilitado por "Iniciar conversa")
- Modify: `sapatao-rh/components/funil/candidate-modal.tsx` (idem)
- Create: `sapatao-rh/components/chat/nova-conversa-dialog.tsx`
- Modify: `sapatao-rh/components/chat/conversation-list.tsx` (botão "Nova conversa" no header)
- Modify: `sapatao-rh/app/(app)/chat/page.tsx` (carrega unidades e repassa à lista)

**Interfaces:**
- Consumes: `iniciarConversa`, `buscarCandidatosSemConversa` (Task 2), `NovoCandidatoDialog` em modo controlado (`withTrigger={false}`, `onCreated`).
- Produces (props): `NovaConversaDialog({ vagas: string[]; unidades: { id: string; nome: string }[] })`.
- Modifies (props de `ConversationList`): ganha `vagas: string[]; unidades: { id: string; nome: string }[]`.
- Fluxo: sucesso → `router.push("/chat?c={conversationId}&tpl=saudacao")` (o prefill do `tpl` é a Task 7 — até lá o parâmetro é simplesmente ignorado).

- [ ] **Step 1: `FichaAcoes` — Iniciar conversa**

Em `components/candidatos/ficha-acoes.tsx`, trocar o import da action de candidatos (adicionado na Task 4):

```tsx
import type { Responsavel } from "@/app/(app)/candidatos/actions";
```

por:

```tsx
import { iniciarConversa, type Responsavel } from "@/app/(app)/candidatos/actions";
```

Logo após o fim do handler `onMover` — o trecho exato:

```tsx
  const onMover = (paraEtapaId: string) => {
    if (paraEtapaId === etapaId) return;
    const etapa = etapas.find((e) => e.id === paraEtapaId);
    if (etapa?.requires_confirm) {
      setConfirmEtapa(etapa);
      return;
    }
    doMove(paraEtapaId);
  };
```

inserir:

```tsx
  const onIniciarConversa = () => {
    startTransition(async () => {
      const r = await iniciarConversa(candidatoId);
      if (r.ok) router.push(`/chat?c=${r.conversationId}&tpl=saudacao`);
      else toast.error("Não foi possível iniciar a conversa.");
    });
  };
```

E trocar o botão:

```tsx
      <Button
        size="sm"
        variant="outline"
        render={conversationId ? <Link href={`/chat?c=${conversationId}`} /> : undefined}
        disabled={!conversationId}
      >
        <MessagesSquare className="size-3.5" />
        Abrir conversa
      </Button>
```

por:

```tsx
      {conversationId ? (
        <Button size="sm" variant="outline" render={<Link href={`/chat?c=${conversationId}`} />}>
          <MessagesSquare className="size-3.5" />
          Abrir conversa
        </Button>
      ) : (
        canEdit && (
          <Button size="sm" variant="outline" onClick={onIniciarConversa} disabled={pending}>
            <MessagesSquare className="size-3.5" />
            Iniciar conversa
          </Button>
        )
      )}
```

- [ ] **Step 2: `CandidateModal` — Iniciar conversa**

Em `components/funil/candidate-modal.tsx`, trocar:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
```

por:

```tsx
"use client";
import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
```

Trocar a linha de import das actions:

```tsx
import { carregarHistorico, carregarEntrevista, moverCandidatoAction, salvarNotas } from "@/app/(app)/funil/actions";
```

por:

```tsx
import { carregarHistorico, carregarEntrevista, moverCandidatoAction, salvarNotas } from "@/app/(app)/funil/actions";
import { iniciarConversa } from "@/app/(app)/candidatos/actions";
```

Logo após `const [pending, startTransition] = useTransition();`, inserir:

```tsx
  const router = useRouter();
```

Logo após o fim do handler `onSalvarNotas` — o trecho exato:

```tsx
  const onSalvarNotas = () => {
    startTransition(async () => {
      const r = await salvarNotas({ candidatoId: candidato.id, notas });
      if (r.ok) toast.success("Notas salvas.");
      else toast.error("Erro ao salvar notas.");
    });
  };
```

inserir:

```tsx
  const onIniciarConversa = () => {
    startTransition(async () => {
      const r = await iniciarConversa(candidato.id);
      if (r.ok) router.push(`/chat?c=${r.conversationId}&tpl=saudacao`);
      else toast.error("Não foi possível iniciar a conversa.");
    });
  };
```

E trocar o botão:

```tsx
          <Button
            size="sm"
            variant="outline"
            render={
              candidato.conversationId ? (
                <Link href={`/chat?c=${candidato.conversationId}`} />
              ) : undefined
            }
            disabled={!candidato.conversationId}
          >
            Abrir conversa
          </Button>
```

por:

```tsx
          {candidato.conversationId ? (
            <Button
              size="sm"
              variant="outline"
              render={<Link href={`/chat?c=${candidato.conversationId}`} />}
            >
              Abrir conversa
            </Button>
          ) : (
            canMove && (
              <Button size="sm" variant="outline" onClick={onIniciarConversa} disabled={pending}>
                Iniciar conversa
              </Button>
            )
          )}
```

- [ ] **Step 3: Criar `components/chat/nova-conversa-dialog.tsx`**

```tsx
"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageSquarePlus } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";
import {
  buscarCandidatosSemConversa,
  iniciarConversa,
  type CandidatoBusca,
} from "@/app/(app)/candidatos/actions";

/** "Nova conversa" no header da Central: busca candidatos SEM conversa
 *  (nome/telefone, debounce) e atalho para cadastrar um novo candidato. */
export function NovaConversaDialog({
  vagas,
  unidades,
}: {
  vagas: string[];
  unidades: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [novoOpen, setNovoOpen] = useState(false);
  const [q, setQ] = useState("");
  const [resultados, setResultados] = useState<CandidatoBusca[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onBusca = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      const termo = value.trim();
      if (termo.length < 2) {
        setResultados([]);
        return;
      }
      setBuscando(true);
      try {
        setResultados(await buscarCandidatosSemConversa(termo));
      } finally {
        setBuscando(false);
      }
    }, 350);
  };

  const abrirConversa = async (candidatoId: string) => {
    setPendingId(candidatoId);
    try {
      const r = await iniciarConversa(candidatoId);
      if (r.ok) {
        setOpen(false);
        router.push(`/chat?c=${r.conversationId}&tpl=saudacao`);
      } else {
        toast.error("Não foi possível iniciar a conversa.");
      }
    } finally {
      setPendingId(null);
    }
  };

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          setQ("");
          setResultados([]);
          setOpen(true);
        }}
      >
        <MessageSquarePlus className="size-3.5" />
        Nova conversa
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova conversa</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={q}
              onChange={(e) => onBusca(e.target.value)}
              placeholder="Buscar candidato sem conversa (nome ou telefone)…"
              autoFocus
            />
            {buscando ? (
              <p className="text-sm text-neutro-700">Buscando…</p>
            ) : resultados.length === 0 ? (
              <p className="text-sm text-neutro-700">
                {q.trim().length < 2
                  ? "Digite ao menos 2 caracteres para buscar."
                  : "Nenhum candidato sem conversa encontrado."}
              </p>
            ) : (
              <ul className="max-h-64 divide-y divide-neutro-100 overflow-y-auto">
                {resultados.map((cand) => (
                  <li key={cand.id}>
                    <button
                      type="button"
                      onClick={() => abrirConversa(cand.id)}
                      disabled={pendingId !== null}
                      className="flex w-full items-center justify-between gap-2 px-1 py-2 text-left text-sm hover:bg-neutro-50 disabled:opacity-50"
                    >
                      <span className="truncate font-medium text-neutro-900">{cand.nome}</span>
                      <span className="shrink-0 text-xs text-neutro-700">
                        {pendingId === cand.id ? "Abrindo…" : cand.telefone}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-neutro-200 pt-3">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setOpen(false);
                  setNovoOpen(true);
                }}
              >
                + Cadastrar novo candidato
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <NovoCandidatoDialog
        vagas={vagas}
        unidades={unidades}
        withTrigger={false}
        open={novoOpen}
        onOpenChange={setNovoOpen}
        onCreated={(id) => void abrirConversa(id)}
      />
    </>
  );
}
```

- [ ] **Step 4: Header da lista de conversas**

Em `components/chat/conversation-list.tsx`, trocar o import de tipos:

```tsx
import type { ConversationWithCandidato } from "@/lib/chat/queries";
```

por:

```tsx
import { NovaConversaDialog } from "@/components/chat/nova-conversa-dialog";
import type { ConversationWithCandidato } from "@/lib/chat/queries";
```

Trocar a interface:

```tsx
interface Props {
  conversations: ConversationWithCandidato[];
  activeId: string | null;
}

export function ConversationList({ conversations, activeId }: Props) {
```

por:

```tsx
interface Props {
  conversations: ConversationWithCandidato[];
  activeId: string | null;
  vagas: string[];
  unidades: { id: string; nome: string }[];
}

export function ConversationList({ conversations, activeId, vagas, unidades }: Props) {
```

E trocar o header:

```tsx
      <div className="border-b border-neutro-200 p-3">
        <h2 className="mb-2 font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
```

por:

```tsx
      <div className="border-b border-neutro-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
          <NovaConversaDialog vagas={vagas} unidades={unidades} />
        </div>
```

- [ ] **Step 5: `chat/page.tsx` carrega unidades e repassa**

No arquivo da Task 5, trocar:

```tsx
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
```

por:

```tsx
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import { createClient } from "@/lib/supabase/server";
```

Trocar:

```tsx
  const [empresaId, conversations, funil, vagas, responsaveis] = await Promise.all([
    getEmpresaId(),
    listConversations(),
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
  ]);
```

por:

```tsx
  const supabase = await createClient();
  const [empresaId, conversations, funil, vagas, responsaveis, unidadesRes] = await Promise.all([
    getEmpresaId(),
    listConversations(),
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];
```

E trocar:

```tsx
        <ConversationList conversations={conversations} activeId={displayedConvId} />
```

por:

```tsx
        <ConversationList
          conversations={conversations}
          activeId={displayedConvId}
          vagas={vagas}
          unidades={unidades}
        />
```

- [ ] **Step 6: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 253 passed; tsc/lint sem erros.

Smoke:
1. Ficha de candidato SEM conversa → "Iniciar conversa" → navega para `/chat?c=...&tpl=saudacao` com a conversa vazia aberta; enviar um texto funciona (fluxo otimista normal).
2. Modal do funil (card sem conversa) → mesmo comportamento.
3. `/chat` → "Nova conversa" → buscar por nome → escolher → conversa abre; "Cadastrar novo candidato" abre o NovoCandidatoDialog e, ao salvar, já cai na conversa nova.
4. Candidato que JÁ tem conversa continua com "Abrir conversa" (link).

- [ ] **Step 7: Commit**

```bash
git add sapatao-rh/components/candidatos/ficha-acoes.tsx sapatao-rh/components/funil/candidate-modal.tsx sapatao-rh/components/chat/nova-conversa-dialog.tsx sapatao-rh/components/chat/conversation-list.tsx "sapatao-rh/app/(app)/chat/page.tsx"
git commit -m "feat(sp6): iniciar conversa na ficha/modal + nova conversa na central"
```

---

### Task 7: Composer — prefill via `?tpl=` + picker de templates

**Files:**
- Modify: `sapatao-rh/components/chat/composer.tsx` (REESCRITA — prefill + picker)
- Modify: `sapatao-rh/components/chat/message-thread.tsx` (repassa props)
- Modify: `sapatao-rh/app/(app)/chat/page.tsx` (lê `tpl`, resolve templates preenchidos)

**Interfaces:**
- Produces: `export type TemplatePronto = { id: string; nome: string; categoria: string; conteudo: string }` (conteúdo JÁ preenchido server-side com os dados do candidato ativo).
- Modifies (props): `Composer({ conversationId, prefill, templates })`, `MessageThread` ganha `prefill: string | null; templates: TemplatePronto[]`.
- Consumes: `listTemplatesAtivos` + `preencherTemplate` (Task 1).
- Comportamento (spec §4): prefill só na montagem e só com textarea vazio; editável; sem template da categoria → composer vazio (sem erro); depois de aplicar, remove `tpl` da URL. Picker: campo vazio → substitui; senão → anexa ao final.

- [ ] **Step 1: `chat/page.tsx` — resolver prefill e templates**

Trocar:

```tsx
import { getFunilComEtapas } from "@/lib/funil/queries";
```

por:

```tsx
import { getFunilComEtapas } from "@/lib/funil/queries";
import { listTemplatesAtivos } from "@/lib/chat/queries";
import { preencherTemplate } from "@/lib/whatsapp/templates";
import type { TemplatePronto } from "@/components/chat/composer";
```

Trocar:

```tsx
  const { c } = await searchParams;
  const activeConversationId = typeof c === "string" ? c : null;
```

por:

```tsx
  const { c, tpl } = await searchParams;
  const activeConversationId = typeof c === "string" ? c : null;
  const tplCategoria = typeof tpl === "string" ? tpl : null;
```

Trocar (dentro do `if (displayedConv)` — bloco existente):

```tsx
    thread = threadResult;
    activeCandidato = candidato;
  }
```

por:

```tsx
    thread = threadResult;
    activeCandidato = candidato;
  }

  // Templates ativos com variáveis JÁ resolvidas para o candidato ativo (SP6).
  const templatesAtivos = await listTemplatesAtivos();
  let unidadeNome: string | null = null;
  if (activeCandidato?.unidade_id) {
    const { data: unidadeRow } = await supabase
      .from("unidades")
      .select("nome")
      .eq("id", activeCandidato.unidade_id)
      .maybeSingle();
    unidadeNome = unidadeRow?.nome ?? null;
  }
  const dadosCandidato = {
    nome: activeCandidato?.nome ?? null,
    vaga: activeCandidato?.vaga_interesse ?? null,
    unidade: unidadeNome,
  };
  const templatesProntos: TemplatePronto[] = templatesAtivos.map((t) => ({
    id: t.id,
    nome: t.nome,
    categoria: t.categoria ?? "geral",
    conteudo: preencherTemplate(t.conteudo, dadosCandidato),
  }));
  // Sem template da categoria pedida → sem prefill (composer vazio, sem erro).
  const prefill =
    tplCategoria && activeCandidato
      ? (templatesProntos.find((t) => t.categoria === tplCategoria)?.conteudo ?? null)
      : null;
```

E trocar:

```tsx
          <MessageThread
            key={displayedConvId}
            messages={thread.messages}
            hasMore={thread.hasMore}
            conversationId={displayedConvId}
          />
```

por:

```tsx
          <MessageThread
            key={displayedConvId}
            messages={thread.messages}
            hasMore={thread.hasMore}
            conversationId={displayedConvId}
            prefill={prefill}
            templates={templatesProntos}
          />
```

- [ ] **Step 2: `message-thread.tsx` — repassar props**

Trocar:

```tsx
interface Props {
  messages: MessageWithSignedUrl[];
  hasMore: boolean;
  conversationId: string;
}
```

por:

```tsx
interface Props {
  messages: MessageWithSignedUrl[];
  hasMore: boolean;
  conversationId: string;
  prefill: string | null;
  templates: TemplatePronto[];
}
```

Trocar o import do Composer:

```tsx
import { Composer } from "./composer";
```

por:

```tsx
import { Composer, type TemplatePronto } from "./composer";
```

Trocar a assinatura:

```tsx
export function MessageThread({ messages, hasMore, conversationId }: Props) {
```

por:

```tsx
export function MessageThread({ messages, hasMore, conversationId, prefill, templates }: Props) {
```

E trocar (no fim do JSX):

```tsx
      {/* Composer */}
      <Composer conversationId={conversationId} />
```

por:

```tsx
      {/* Composer */}
      <Composer conversationId={conversationId} prefill={prefill} templates={templates} />
```

- [ ] **Step 3: Reescrever `components/chat/composer.tsx`**

Substituir o arquivo INTEIRO por:

```tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { FileText } from "lucide-react";
import { useSendQueue } from "@/stores/send-queue";
import { dispatchSend, dispatchSendMedia } from "@/lib/chat/dispatch-send";

export type TemplatePronto = {
  id: string;
  nome: string;
  categoria: string;
  conteudo: string;
};

interface Props {
  conversationId: string;
  /** Conteúdo do template já preenchido (via ?tpl=) — aplicado 1x, só com campo vazio. */
  prefill?: string | null;
  /** Templates ativos com variáveis resolvidas para o candidato da conversa. */
  templates?: TemplatePronto[];
}

export function Composer({ conversationId, prefill = null, templates = [] }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const enqueueAndRun = useSendQueue((s) => s.enqueueAndRun);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pickerOpen, setPickerOpen] = useState(false);

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }

  // Prefill do template (?tpl=): só na montagem e só se o campo estiver vazio.
  // Depois de aplicar, tira o tpl da URL para não re-preencher em reloads.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current || !prefill) return;
    const el = textareaRef.current;
    if (!el || el.value.trim()) return;
    prefillApplied.current = true;
    el.value = prefill;
    autoGrow(el);
    el.focus();
    const params = new URLSearchParams(searchParams.toString());
    if (params.has("tpl")) {
      params.delete("tpl");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    }
  }, [prefill, pathname, router, searchParams]);

  // Picker: templates agrupados por categoria.
  const grupos = useMemo(() => {
    const map = new Map<string, TemplatePronto[]>();
    for (const t of templates) {
      const lista = map.get(t.categoria) ?? [];
      lista.push(t);
      map.set(t.categoria, lista);
    }
    return [...map.entries()];
  }, [templates]);

  function inserirTemplate(t: TemplatePronto) {
    const el = textareaRef.current;
    if (!el) return;
    // Campo vazio: substitui; senão anexa ao final (spec §4).
    el.value = el.value.trim() ? `${el.value}\n${t.conteudo}` : t.conteudo;
    autoGrow(el);
    el.focus();
    setPickerOpen(false);
  }

  function handleSend() {
    const el = textareaRef.current;
    if (!el) return;

    const texto = el.value.trim();
    if (!texto) return;

    const clientMessageId = crypto.randomUUID();

    // Clear immediately — synchronous, before any await
    el.value = "";
    // Reset textarea height if it was auto-grown
    el.style.height = "auto";

    enqueueAndRun({ clientMessageId, conversationId, texto }, dispatchSend);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    // Shift+Enter falls through → natural newline insertion
  }

  function handleInput(e: React.FormEvent<HTMLTextAreaElement>) {
    autoGrow(e.currentTarget);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    // Reset input so the same file can be re-picked next time
    e.target.value = "";

    for (const file of files) {
      const clientMessageId = crypto.randomUUID();
      const objectUrl = URL.createObjectURL(file);

      // Read file as base64
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // btoa works for binary data up to ~64MB; for very large files a chunked
      // approach is safer, but WhatsApp caps media at 16 MB anyway.
      let b64 = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        b64 += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      const fileBase64 = btoa(b64);

      const mime = file.type;
      const fileName = file.name;

      // Capture variables in closure for the dispatch function
      const capturedClientMessageId = clientMessageId;
      const capturedConversationId = conversationId;
      const capturedFileBase64 = fileBase64;
      const capturedMime = mime;
      const capturedFileName = fileName;

      enqueueAndRun(
        {
          clientMessageId,
          conversationId,
          texto: "",
          media: { objectUrl, mime, fileName },
        },
        () =>
          dispatchSendMedia({
            clientMessageId: capturedClientMessageId,
            conversationId: capturedConversationId,
            fileBase64: capturedFileBase64,
            mime: capturedMime,
            fileName: capturedFileName,
          }),
      );
    }
  }

  return (
    <div className="border-t border-neutro-200 bg-white p-3">
      <div className="flex items-end gap-2">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,.pdf,.doc,.docx"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />

        {/* Picker de templates */}
        {templates.length > 0 && (
          <div className="relative mb-px">
            <button
              type="button"
              aria-label="Inserir template"
              title="Inserir template"
              onClick={() => setPickerOpen((o) => !o)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutro-200 bg-neutro-50 text-neutro-700 transition-colors hover:bg-neutro-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px"
            >
              <FileText className="size-4" />
            </button>
            {pickerOpen && (
              <div className="absolute bottom-11 left-0 z-20 max-h-72 w-72 overflow-y-auto rounded-lg border border-neutro-200 bg-white p-2 shadow-warm">
                {grupos.map(([categoria, lista]) => (
                  <div key={categoria} className="mb-2 last:mb-0">
                    <p className="px-1 pb-1 text-[10px] font-semibold tracking-wide text-neutro-500 uppercase">
                      {categoria}
                    </p>
                    {lista.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => inserirTemplate(t)}
                        className="block w-full rounded px-2 py-1.5 text-left text-sm text-neutro-900 hover:bg-neutro-50"
                      >
                        <span className="font-medium">{t.nome}</span>
                        <span className="mt-0.5 block truncate text-xs text-neutro-700">
                          {t.conteudo}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Paperclip / attach button */}
        <button
          type="button"
          aria-label="Anexar arquivo"
          onClick={() => fileInputRef.current?.click()}
          className="mb-px flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutro-200 bg-neutro-50 text-neutro-700 transition-colors hover:bg-neutro-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px"
        >
          {/* Paperclip icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-4"
          >
            <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
        </button>

        <textarea
          ref={textareaRef}
          rows={2}
          placeholder="Digite uma mensagem... (Enter envia, Shift+Enter nova linha)"
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          className="flex-1 resize-none rounded-lg border border-neutro-200 bg-neutro-50 px-3 py-2 text-sm text-neutro-900 placeholder:text-neutro-500 focus:border-sapatao-verde focus:outline-none min-h-[2.5rem] max-h-40 overflow-y-auto"
        />
        <button
          type="button"
          onClick={handleSend}
          aria-label="Enviar mensagem"
          className="mb-px flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sapatao-verde text-white transition-colors hover:bg-sapatao-verde/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-sapatao-verde/50 active:translate-y-px disabled:opacity-50"
        >
          {/* Send arrow icon */}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="size-4"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Suíte + tsc + smoke manual**

Antes do smoke, garanta um template de saudação no banco (a UI de CRUD é a Task 8):

```powershell
docker exec supabase_db_qysnyiufifgldieqnsly psql -U postgres -d postgres -c "insert into message_templates (empresa_id, nome, categoria, conteudo) select id, 'Saudacao padrao', 'saudacao', 'Olá {{nome}}! Aqui é do RH da Estação Sapatão, sobre a vaga {{vaga}}. Podemos conversar?' from empresas where slug='estacao-sapatao' on conflict do nothing;"
```

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 253 passed; tsc/lint sem erros.

Smoke:
1. Ficha de candidato sem conversa (com vaga preenchida) → "Iniciar conversa" → composer abre com "Olá {PrimeiroNome}! ... sobre a vaga {Vaga}..." (sem `{{...}}` cru); a URL perde o `&tpl=saudacao` sozinha; o texto é editável e o envio funciona.
2. Candidato SEM vaga: o trecho "sobre a vaga" aparece sem placeholder cru (variável removida).
3. Botão de template (ícone de documento) abre o popover agrupado por categoria; clicar insere o conteúdo preenchido (substitui se vazio; anexa se já há texto).
4. `?tpl=inexistente` → composer vazio, sem erro no console.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/components/chat/composer.tsx sapatao-rh/components/chat/message-thread.tsx "sapatao-rh/app/(app)/chat/page.tsx"
git commit -m "feat(sp6): prefill do composer via ?tpl= + picker de templates"
```

---

### Task 8: Config > Templates — CRUD (admin)

**Files:**
- Create: `sapatao-rh/lib/validations/template.ts`
- Test: `sapatao-rh/lib/validations/template.test.ts`
- Create: `sapatao-rh/app/(app)/configuracoes/templates/actions.ts`
- Create: `sapatao-rh/app/(app)/configuracoes/templates/page.tsx`
- Create: `sapatao-rh/components/configuracoes/templates-editor.tsx`
- Create: `sapatao-rh/components/configuracoes/template-form-dialog.tsx`
- Modify: `sapatao-rh/components/configuracoes/settings-nav.tsx`

**Interfaces:**
- Produces (schema): `templateSchema = { nome: min 1 max 80, categoria: lowercase [a-z0-9_-]{1,40}, conteudo: min 1 max 2000, ativo: boolean }`; `CATEGORIAS_TEMPLATE = ["saudacao", "follow_up", "entrevista", "outro"]` (sugestões do datalist).
- Produces (actions, admin-only — mesmo `isAdmin` de `app/(app)/configuracoes/funil/actions.ts`): `criarTemplate(input)`, `atualizarTemplate(id, input)`, `excluirTemplate(id)` → `{ ok: true } | { ok: false; error }`.
- RLS: policy `message_templates_write` (0007) já permite admin/rh — a action restringe a admin (spec §3).
- Padrão de UI: imitar `/configuracoes/funil` (lista + dialog + delete com confirmação inline).

- [ ] **Step 1: Teste do schema que falha**

```ts
// lib/validations/template.test.ts
import { describe, it, expect } from "vitest";
import { templateSchema } from "./template";

describe("templateSchema", () => {
  it("aceita template válido e normaliza categoria para minúsculas", () => {
    const r = templateSchema.safeParse({
      nome: "Saudação padrão",
      categoria: " Saudacao ",
      conteudo: "Olá {{nome}}!",
      ativo: true,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.categoria).toBe("saudacao");
  });

  it("rejeita categoria com espaço ou caracteres inválidos", () => {
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "follow up", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "olá!", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
  });

  it("rejeita nome e conteúdo vazios", () => {
    expect(
      templateSchema.safeParse({ nome: "", categoria: "outro", conteudo: "oi", ativo: true })
        .success,
    ).toBe(false);
    expect(
      templateSchema.safeParse({ nome: "X", categoria: "outro", conteudo: "  ", ativo: true })
        .success,
    ).toBe(false);
  });

  it("aceita ativo=false", () => {
    const r = templateSchema.safeParse({
      nome: "X",
      categoria: "outro",
      conteudo: "oi",
      ativo: false,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.ativo).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/validations/template.test.ts`
Expected: FAIL — `Cannot find module './template'`.

- [ ] **Step 3: Implementar o schema**

```ts
// lib/validations/template.ts
import { z } from "zod";

/** Sugestões de categoria (o campo é texto livre; "saudacao" é usada no prefill). */
export const CATEGORIAS_TEMPLATE = ["saudacao", "follow_up", "entrevista", "outro"] as const;

export const templateSchema = z.object({
  nome: z.string().trim().min(1, "Nome obrigatório").max(80),
  categoria: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9_-]{1,40}$/, "Categoria: minúsculas, números, _ ou - (sem espaços)"),
  conteudo: z.string().trim().min(1, "Conteúdo obrigatório").max(2000),
  ativo: z.boolean(),
});
export type TemplateInputDTO = z.infer<typeof templateSchema>;
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/validations/template.test.ts`
Expected: 4 passed.

- [ ] **Step 5: Actions**

Criar `app/(app)/configuracoes/templates/actions.ts`:

```ts
"use server";

import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { templateSchema, type TemplateInputDTO } from "@/lib/validations/template";
import type { Profile } from "@/types/database";

type ActionResult = { ok: true } | { ok: false; error: string };

function isAdmin(p: Profile | null): p is Profile {
  return !!p && (p.platform_admin || p.role === "admin");
}

/** Cria um template de mensagem (admin). */
export async function criarTemplate(input: TemplateInputDTO): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").insert({
    empresa_id: profile.empresa_id,
    nome: parsed.data.nome,
    categoria: parsed.data.categoria,
    conteudo: parsed.data.conteudo,
    ativo: parsed.data.ativo,
  });
  if (error) {
    console.error("[config/templates] criarTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}

/** Atualiza nome/categoria/conteúdo/ativo de um template (admin). */
export async function atualizarTemplate(
  templateId: string,
  input: TemplateInputDTO,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };
  const parsed = templateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalido" };

  const supabase = await createClient();
  const { error } = await supabase
    .from("message_templates")
    .update({
      nome: parsed.data.nome,
      categoria: parsed.data.categoria,
      conteudo: parsed.data.conteudo,
      ativo: parsed.data.ativo,
    })
    .eq("id", templateId);
  if (error) {
    console.error("[config/templates] atualizarTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}

/** Exclui um template (admin). */
export async function excluirTemplate(templateId: string): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!isAdmin(profile)) return { ok: false, error: "forbidden" };

  const supabase = await createClient();
  const { error } = await supabase.from("message_templates").delete().eq("id", templateId);
  if (error) {
    console.error("[config/templates] excluirTemplate:", error);
    return { ok: false, error: "db" };
  }
  revalidatePath("/configuracoes/templates");
  return { ok: true };
}
```

- [ ] **Step 6: Dialog de criar/editar**

Criar `components/configuracoes/template-form-dialog.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { criarTemplate, atualizarTemplate } from "@/app/(app)/configuracoes/templates/actions";
import { CATEGORIAS_TEMPLATE } from "@/lib/validations/template";
import type { MessageTemplate } from "@/types/database";

export function TemplateFormDialog({ template }: { template?: MessageTemplate }) {
  const router = useRouter();
  const editing = !!template;
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("saudacao");
  const [conteudo, setConteudo] = useState("");
  const [ativo, setAtivo] = useState(true);

  function reset() {
    setNome(template?.nome ?? "");
    setCategoria(template?.categoria ?? "saudacao");
    setConteudo(template?.conteudo ?? "");
    setAtivo(template?.ativo ?? true);
  }

  async function submit() {
    setPending(true);
    const payload = { nome: nome.trim(), categoria: categoria.trim(), conteudo, ativo };
    const res = editing
      ? await atualizarTemplate(template!.id, payload)
      : await criarTemplate(payload);
    setPending(false);
    if (res.ok) {
      toast.success(editing ? "Template atualizado." : "Template criado.");
      setOpen(false);
      router.refresh();
    } else {
      toast.error(
        res.error === "invalido"
          ? "Confira nome, categoria (sem espaços) e conteúdo."
          : res.error === "forbidden"
            ? "Sem permissão."
            : "Erro ao salvar o template.",
      );
    }
  }

  return (
    <>
      <Button
        size={editing ? "sm" : "default"}
        variant={editing ? "ghost" : "default"}
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {editing ? "Editar" : "Novo template"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar template" : "Novo template"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div>
              <Label className="mb-1">Nome</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} />
            </div>
            <div>
              <Label className="mb-1">Categoria</Label>
              <Input
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                list="sp6-categorias-template"
                maxLength={40}
              />
              <datalist id="sp6-categorias-template">
                {CATEGORIAS_TEMPLATE.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-neutro-500">
                “saudacao” é usada no pré-preenchimento de novas conversas.
              </p>
            </div>
            <div>
              <Label className="mb-1">Conteúdo</Label>
              <textarea
                value={conteudo}
                onChange={(e) => setConteudo(e.target.value)}
                rows={5}
                maxLength={2000}
                className="w-full rounded-lg border border-neutro-200 p-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                placeholder={"Olá {{nome}}! Vi seu interesse na vaga {{vaga}}…"}
              />
              <p className="mt-1 text-xs text-neutro-500">
                Variáveis: {"{{nome}}"} (primeiro nome), {"{{vaga}}"} e {"{{unidade}}"} — sem
                valor, somem do texto.
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutro-900">
              <input
                type="checkbox"
                checked={ativo}
                onChange={(e) => setAtivo(e.target.checked)}
              />
              Ativo (aparece no picker e no pré-preenchimento)
            </label>
          </div>

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancelar</DialogClose>
            <Button onClick={submit} disabled={pending || !nome.trim() || !conteudo.trim()}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 7: Lista com delete inline**

Criar `components/configuracoes/templates-editor.tsx`:

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TemplateFormDialog } from "./template-form-dialog";
import { excluirTemplate } from "@/app/(app)/configuracoes/templates/actions";
import type { MessageTemplate } from "@/types/database";

function TemplateRow({
  template,
  onExcluir,
}: {
  template: MessageTemplate;
  onExcluir: (id: string) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return (
    <div className="flex items-start gap-3 rounded-lg border border-neutro-200 bg-white p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium text-neutro-900">{template.nome}</p>
          <span className="rounded bg-neutro-100 px-1.5 py-0.5 text-[10px] text-neutro-700">
            {template.categoria ?? "geral"}
          </span>
          {!template.ativo && (
            <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
              inativo
            </span>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-xs whitespace-pre-wrap text-neutro-700">
          {template.conteudo}
        </p>
      </div>
      <TemplateFormDialog template={template} />
      {confirming ? (
        <div className="flex items-center gap-1">
          <span className="text-xs text-neutro-700">Confirmar?</span>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            onClick={() => {
              setConfirming(false);
              onExcluir(template.id);
            }}
          >
            Sim
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
            Não
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          onClick={() => setConfirming(true)}
        >
          Excluir
        </Button>
      )}
    </div>
  );
}

export function TemplatesEditor({ templates }: { templates: MessageTemplate[] }) {
  const router = useRouter();
  const onExcluir = (id: string) => {
    excluirTemplate(id)
      .then((r) => {
        if (r.ok) {
          toast.success("Template excluído.");
          router.refresh();
        } else {
          toast.error(r.error === "forbidden" ? "Sem permissão." : "Não foi possível excluir.");
        }
      })
      .catch(() => toast.error("Erro ao excluir o template."));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <TemplateFormDialog />
      </div>
      {templates.length === 0 ? (
        <p className="text-sm text-neutro-700">
          Nenhum template ainda. Crie o primeiro — sugestão: um de categoria “saudacao”, usado no
          pré-preenchimento de novas conversas.
        </p>
      ) : (
        <div className="space-y-2">
          {templates.map((t) => (
            <TemplateRow key={t.id} template={t} onExcluir={onExcluir} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 8: Page + SettingsNav**

Criar `app/(app)/configuracoes/templates/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/shell/page-container";
import { SettingsNav } from "@/components/configuracoes/settings-nav";
import { TemplatesEditor } from "@/components/configuracoes/templates-editor";
import type { MessageTemplate } from "@/types/database";

export const dynamic = "force-dynamic";

export default async function TemplatesConfigPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("message_templates")
    .select("*")
    .order("categoria")
    .order("nome");
  const templates = (data ?? []) as MessageTemplate[];

  return (
    <PageContainer>
      <SettingsNav />
      <div className="space-y-1">
        <h1 className="font-display text-2xl font-bold">Templates</h1>
        <p className="text-sm text-neutro-700">
          Mensagens prontas do WhatsApp. As variáveis {"{{nome}}"}, {"{{vaga}}"} e {"{{unidade}}"}{" "}
          são preenchidas com os dados do candidato.
        </p>
      </div>
      <div className="mt-6 max-w-2xl">
        <TemplatesEditor templates={templates} />
      </div>
    </PageContainer>
  );
}
```

Em `components/configuracoes/settings-nav.tsx`, trocar:

```tsx
const ITEMS = [
  { href: "/configuracoes/acessos", label: "Acessos" },
  { href: "/configuracoes/whatsapp", label: "WhatsApp" },
  { href: "/configuracoes/funil", label: "Funil" },
];
```

por:

```tsx
const ITEMS = [
  { href: "/configuracoes/acessos", label: "Acessos" },
  { href: "/configuracoes/whatsapp", label: "WhatsApp" },
  { href: "/configuracoes/funil", label: "Funil" },
  { href: "/configuracoes/templates", label: "Templates" },
];
```

- [ ] **Step 9: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 257 passed (253 + 4); tsc/lint sem erros.

Smoke (admin): `/configuracoes/templates` → aba "Templates" no nav → criar template ("Follow-up", categoria `follow_up`, conteúdo com `{{nome}}`) → aparece na lista; editar → persiste; desativar → some do picker do chat; excluir com confirmação inline. Logado como `rh`, `/configuracoes/templates` redireciona para `/dashboard`.

- [ ] **Step 10: Commit**

```bash
git add sapatao-rh/lib/validations/template.ts sapatao-rh/lib/validations/template.test.ts "sapatao-rh/app/(app)/configuracoes/templates/" sapatao-rh/components/configuracoes/templates-editor.tsx sapatao-rh/components/configuracoes/template-form-dialog.tsx sapatao-rh/components/configuracoes/settings-nav.tsx
git commit -m "feat(sp6): config>templates - crud de templates de mensagem (admin)"
```

---

### Task 9: Filtros do Kanban (URL-driven) + topbar escreve `?u=` + morte do Zustand

**Files:**
- Create: `sapatao-rh/lib/funil/filtros.ts`
- Test: `sapatao-rh/lib/funil/filtros.test.ts`
- Modify: `sapatao-rh/lib/funil/queries.ts` (`listCandidatosDoFunil` ganha `{ q, vaga, respId, unidadeId }`)
- Create: `sapatao-rh/components/funil/funil-filtros.tsx`
- Modify: `sapatao-rh/app/(app)/funil/page.tsx` (REESCRITA sobre a versão da Task 3)
- Modify: `sapatao-rh/components/shell/topbar.tsx` (REESCRITA — seletor escreve `?u=`)
- Modify: `sapatao-rh/app/(app)/layout.tsx` (Topbar em `<Suspense>` — usa `useSearchParams`)
- Delete: `sapatao-rh/stores/unidade-store.ts` (único consumidor era a topbar — verificar com grep)

**Interfaces:**
- Produces: `type FiltrosFunil = { q: string; vaga: string | null; resp: string | null; unidadeId: string | null }`; `parseFunilFiltros(sp)` (pura — `resp` aceita uuid ou `"me"`, resolvido para `profile.id` no server component).
- Modifies: `listCandidatosDoFunil(etapaIds: string[], filtros?: { q?: string; vaga?: string | null; respId?: string | null; unidadeId?: string | null })` — único call site é `app/(app)/funil/page.tsx`; `CandidatoFunil` ganha `atribuido_a`.
- Produces (props): `FunilFiltros({ vagas: string[]; responsaveis: Responsavel[] })` — imita `components/candidatos/filtros-bar.tsx` (debounce 350ms, render-time sync, `router.replace`). "Limpar" NÃO mexe em `?u=` (é da topbar).
- Board e contadores refletem o conjunto filtrado (o `count` da coluna já é `list.length`).

- [ ] **Step 1: Teste do parse que falha**

```ts
// lib/funil/filtros.test.ts
import { describe, it, expect } from "vitest";
import { parseFunilFiltros } from "./filtros";

const UUID = "0b8e6f0a-1111-4222-8333-444455556666";

describe("parseFunilFiltros", () => {
  it("defaults: tudo vazio/nulo", () => {
    expect(parseFunilFiltros({})).toEqual({ q: "", vaga: null, resp: null, unidadeId: null });
  });

  it("apara e limita a busca a 80 chars", () => {
    const grande = "a".repeat(100);
    const r = parseFunilFiltros({ q: `  ${grande}  ` });
    expect(r.q).toHaveLength(80);
  });

  it("vaga é texto livre; array (param repetido) é ignorado", () => {
    expect(parseFunilFiltros({ vaga: " Atendente " }).vaga).toBe("Atendente");
    expect(parseFunilFiltros({ vaga: ["a", "b"] }).vaga).toBeNull();
  });

  it("resp aceita 'me' e uuid; rejeita lixo", () => {
    expect(parseFunilFiltros({ resp: "me" }).resp).toBe("me");
    expect(parseFunilFiltros({ resp: UUID }).resp).toBe(UUID);
    expect(parseFunilFiltros({ resp: "drop table" }).resp).toBeNull();
  });

  it("u só aceita uuid", () => {
    expect(parseFunilFiltros({ u: UUID }).unidadeId).toBe(UUID);
    expect(parseFunilFiltros({ u: "todas" }).unidadeId).toBeNull();
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/funil/filtros.test.ts`
Expected: FAIL — `Cannot find module './filtros'`.

- [ ] **Step 3: Implementar o parse**

```ts
// lib/funil/filtros.ts
export type FiltrosFunil = {
  /** Busca livre por nome/telefone (já aparada). Vazia = sem busca. */
  q: string;
  vaga: string | null;
  /** uuid de profile, "me" (resolvido para o usuário logado no server) ou null. */
  resp: string | null;
  unidadeId: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Normaliza os searchParams do /funil (?q=&vaga=&resp=&u=) em filtros tipados. */
export function parseFunilFiltros(
  sp: Record<string, string | string[] | undefined>,
): FiltrosFunil {
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

  const q = (one(sp.q) ?? "").trim().slice(0, 80);
  const vagaRaw = (one(sp.vaga) ?? "").trim().slice(0, 80);
  const respRaw = one(sp.resp);
  const uRaw = one(sp.u);

  let resp: string | null = null;
  if (respRaw === "me") resp = "me";
  else if (respRaw && UUID_RE.test(respRaw)) resp = respRaw;

  return {
    q,
    vaga: vagaRaw || null,
    resp,
    unidadeId: uRaw && UUID_RE.test(uRaw) ? uRaw : null,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/funil/filtros.test.ts`
Expected: 5 passed.

- [ ] **Step 5: `listCandidatosDoFunil` com filtros server-side**

Em `lib/funil/queries.ts`, trocar a linha 1-2 (imports):

```ts
import { createClient } from "@/lib/supabase/server";
import type { Candidato, Funil, FunilEtapa } from "@/types/database";
```

por:

```ts
import { createClient } from "@/lib/supabase/server";
import { buscaOr } from "@/lib/candidatos/filtros";
import type { Candidato, Funil, FunilEtapa } from "@/types/database";
```

No type `CandidatoFunil`, trocar:

```ts
  | "notas_internas"
  | "status"
> & { conversationId: string | null };
```

por:

```ts
  | "notas_internas"
  | "status"
  | "atribuido_a"
> & { conversationId: string | null };
```

E substituir a função `listCandidatosDoFunil` INTEIRA (do comentário `/** Returns candidatos whose etapa_id...` até o fim dela) por:

```ts
export type FiltrosBoard = {
  q?: string;
  vaga?: string | null;
  respId?: string | null;
  unidadeId?: string | null;
};

/** Returns candidatos whose etapa_id is one of `etapaIds` (RLS-scoped), com
 *  filtros server-side de busca/vaga/responsável/unidade (spec SP6 §6).
 *  Embeds the candidato's conversation id. */
export async function listCandidatosDoFunil(
  etapaIds: string[],
  filtros: FiltrosBoard = {},
): Promise<CandidatoFunil[]> {
  if (etapaIds.length === 0) return [];
  const supabase = await createClient();

  let query = supabase
    .from("candidatos")
    .select(
      "id, nome, telefone, cep, idade, endereco, vaga_interesse, score_ia, parecer_ia, tags, etapa_id, etapa_entrou_em, avatar_url, unidade_id, notas_internas, status, atribuido_a, conversations(id)",
    )
    .in("etapa_id", etapaIds)
    .order("etapa_entrou_em", { ascending: true, nullsFirst: true });

  const or = filtros.q ? buscaOr(filtros.q) : null;
  if (or) query = query.or(or);
  if (filtros.vaga) query = query.eq("vaga_interesse", filtros.vaga);
  if (filtros.respId) query = query.eq("atribuido_a", filtros.respId);
  if (filtros.unidadeId) query = query.eq("unidade_id", filtros.unidadeId);

  const { data, error } = await query;
  if (error) {
    console.error("[funil/queries] listCandidatosDoFunil error:", error);
    return [];
  }

  type Row = Omit<CandidatoFunil, "conversationId"> & { conversations: { id: string }[] | null };
  return ((data ?? []) as unknown as Row[]).map((r) => {
    const { conversations, ...rest } = r;
    return { ...rest, conversationId: conversations?.[0]?.id ?? null };
  });
}
```

- [ ] **Step 6: `FunilFiltros`**

Criar `components/funil/funil-filtros.tsx`:

```tsx
"use client";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Responsavel } from "@/app/(app)/candidatos/actions";

const TODOS = "todos";
const MEUS = "me";

/** Toolbar URL-driven do Kanban (?q= com debounce, ?vaga=, ?resp= com "Meus").
 *  A unidade (?u=) é do seletor da topbar — "Limpar" não mexe nela. */
export function FunilFiltros({
  vagas,
  responsaveis,
}: {
  vagas: string[];
  responsaveis: Responsavel[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const qUrl = searchParams.get("q") ?? "";
  const [q, setQ] = useState(qUrl);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Render-time sync (padrão de filtros-bar.tsx): espelha o q da URL quando ele
  // muda por fora (voltar/avançar, limpar), ignorando o eco do próprio debounce.
  const [qAplicado, setQAplicado] = useState(qUrl);
  const [prevQUrl, setPrevQUrl] = useState(qUrl);
  if (prevQUrl !== qUrl) {
    setPrevQUrl(qUrl);
    if (qUrl !== qAplicado) {
      setQ(qUrl);
      setQAplicado(qUrl);
    }
  }

  const aplicar = (patch: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value === null || value === "" || value === TODOS) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const onBusca = (value: string) => {
    setQ(value);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      setQAplicado(value.trim());
      aplicar({ q: value.trim() });
    }, 350);
  };

  const vaga = searchParams.get("vaga") ?? TODOS;
  const resp = searchParams.get("resp") ?? TODOS;
  const temFiltro = qUrl !== "" || vaga !== TODOS || resp !== TODOS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full max-w-56">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-neutro-500" />
        <Input
          value={q}
          onChange={(e) => onBusca(e.target.value)}
          placeholder="Buscar nome ou telefone…"
          className="pl-8"
          aria-label="Buscar candidato no funil"
        />
      </div>

      {vagas.length > 0 && (
        <Select value={vaga} onValueChange={(v: string | null) => aplicar({ vaga: v })}>
          <SelectTrigger size="sm" aria-label="Filtrar por vaga">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as vagas</SelectItem>
            {vagas.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Select value={resp} onValueChange={(v: string | null) => aplicar({ resp: v })}>
        <SelectTrigger size="sm" aria-label="Filtrar por responsável">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODOS}>Todos os responsáveis</SelectItem>
          <SelectItem value={MEUS}>Meus</SelectItem>
          {responsaveis.map((r) => (
            <SelectItem key={r.id} value={r.id}>
              {r.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {temFiltro && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            if (debounce.current) clearTimeout(debounce.current);
            setQAplicado("");
            setQ("");
            aplicar({ q: null, vaga: null, resp: null });
          }}
        >
          <X className="size-3.5" />
          Limpar
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 7: Reescrever `app/(app)/funil/page.tsx`**

Substituir o arquivo INTEIRO (versão da Task 3) por:

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { getFunilComEtapas, listCandidatosDoFunil } from "@/lib/funil/queries";
import { parseFunilFiltros } from "@/lib/funil/filtros";
import { listVagasDistintas } from "@/lib/candidatos/queries";
import { listarResponsaveis } from "@/app/(app)/candidatos/actions";
import { createClient } from "@/lib/supabase/server";
import { Board } from "@/components/funil/board";
import { FunilFiltros } from "@/components/funil/funil-filtros";
import { NovoCandidatoDialog } from "@/components/candidatos/novo-candidato-dialog";

export const dynamic = "force-dynamic";

export default async function FunilPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const sp = await searchParams;
  const filtros = parseFunilFiltros(sp);

  const supabase = await createClient();
  const [funil, vagas, responsaveis, unidadesRes] = await Promise.all([
    getFunilComEtapas(),
    listVagasDistintas(),
    listarResponsaveis(),
    supabase.from("unidades").select("id, nome").eq("ativa", true).order("nome"),
  ]);
  const unidades = (unidadesRes.data ?? []) as { id: string; nome: string }[];

  if (!funil || funil.etapas.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-neutro-700">
        Nenhum funil configurado para esta empresa.
      </div>
    );
  }

  const etapaIds = funil.etapas.map((e) => e.id);
  const candidatos = await listCandidatosDoFunil(etapaIds, {
    q: filtros.q,
    vaga: filtros.vaga,
    respId: filtros.resp === "me" ? profile.id : filtros.resp,
    unidadeId: filtros.unidadeId,
  });
  const canMove = profile.platform_admin || profile.role === "admin" || profile.role === "rh";

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutro-200 bg-card px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <h1 className="font-display text-lg font-bold">Funil</h1>
          <FunilFiltros vagas={vagas} responsaveis={responsaveis} />
        </div>
        {canMove && <NovoCandidatoDialog vagas={vagas} unidades={unidades} aoCriar="refresh" />}
      </div>
      <div className="min-h-0 flex-1">
        <Board
          etapas={funil.etapas}
          candidatos={candidatos}
          empresaId={profile.empresa_id}
          canMove={canMove}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 8: Topbar escreve `?u=` na URL e o store morre**

Verificar consumidores do store (esperado: só a topbar):

```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"
Get-ChildItem -Recurse -File -Include *.ts,*.tsx -Path app,components,lib,stores | Select-String -Pattern "unidade-store|useUnidadeStore" | Select-Object Path, LineNumber, Line
```
Expected: apenas `stores/unidade-store.ts` e `components/shell/topbar.tsx`. (Se aparecer outro consumidor, atualizá-lo para ler `?u=` da URL antes de excluir o store.)

Substituir `components/shell/topbar.tsx` INTEIRO por:

```tsx
"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "@/app/(auth)/login/actions";
import type { Profile, Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const TODAS = "todas";

/** O seletor de unidade escreve ?u= na URL atual — as telas server-side
 *  (Funil etc.) leem o parâmetro e filtram de verdade (spec SP6 §6). */
export function Topbar({ profile, unidades }: { profile: Profile; unidades: Unidade[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const unidadeId = searchParams.get("u") ?? TODAS;

  const onUnidade = (v: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (!v || v === TODAS) params.delete("u");
    else params.set("u", v);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutro-200 bg-card px-4 shadow-warm">
      <Select value={unidadeId} onValueChange={onUnidade}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Unidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={TODAS}>Todas as unidades</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-neutro-900 sm:inline">
          {profile.nome}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
}
```

Em `app/(app)/layout.tsx` (a topbar agora usa `useSearchParams` — Suspense evita erro de prerender), trocar:

```tsx
import { redirect } from "next/navigation";
import { headers } from "next/headers";
```

por:

```tsx
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
```

E trocar:

```tsx
        <Topbar profile={profile} unidades={visiveis} />
```

por:

```tsx
        <Suspense
          fallback={<div className="h-14 shrink-0 border-b border-neutro-200 bg-card" />}
        >
          <Topbar profile={profile} unidades={visiveis} />
        </Suspense>
```

Excluir o store:

```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt"
git rm sapatao-rh/stores/unidade-store.ts
```

- [ ] **Step 9: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 262 passed (257 + 5); tsc/lint sem erros.

Smoke em `/funil`:
1. Digitar nome na busca → URL ganha `?q=` (debounce) e o board mostra só os cards que batem; contadores das colunas refletem.
2. Filtrar vaga e "Meus" (com um candidato atribuído a você via painel do chat/ficha) → conjunto reduz; `?resp=me` na URL.
3. Seletor de unidade da topbar → URL ganha `?u=`; board filtra por unidade DE VERDADE; trocar para "Todas" limpa o `?u=`.
4. "Limpar" zera q/vaga/resp mas mantém `?u=`.

- [ ] **Step 10: Commit**

```bash
git add sapatao-rh/lib/funil/filtros.ts sapatao-rh/lib/funil/filtros.test.ts sapatao-rh/lib/funil/queries.ts sapatao-rh/components/funil/funil-filtros.tsx "sapatao-rh/app/(app)/funil/page.tsx" sapatao-rh/components/shell/topbar.tsx "sapatao-rh/app/(app)/layout.tsx"
git commit -m "feat(sp6): filtros do kanban via URL + topbar escreve ?u= (zustand removido)"
```

(O `git rm` do store já está no index — o commit acima o inclui.)

---

### Task 10: Central — chips Todas / Não lidas / Minhas

**Files:**
- Create: `sapatao-rh/lib/chat/filtro-conversas.ts`
- Test: `sapatao-rh/lib/chat/filtro-conversas.test.ts`
- Modify: `sapatao-rh/lib/chat/queries.ts` (embed ganha `atribuido_a`)
- Modify: `sapatao-rh/components/chat/conversation-list.tsx` (REESCRITA — chips + filtro)
- Modify: `sapatao-rh/app/(app)/chat/page.tsx` (passa `currentUserId`)

**Interfaces:**
- Produces: `type FiltroConversas = "todas" | "nao-lidas" | "minhas"`; `parseFiltroConversas(raw)`; `filtrarConversas(conversas, filtro, userId)` (puras — filtro client-side sobre a lista já carregada, como a busca atual).
- Modifies: `ConversationWithCandidato.candidatos` ganha `atribuido_a` (spec §6: "Minhas" = `candidato.atribuido_a === usuário logado`).
- Modifies (props de `ConversationList`): ganha `currentUserId: string | null`.

- [ ] **Step 1: Teste que falha**

```ts
// lib/chat/filtro-conversas.test.ts
import { describe, it, expect } from "vitest";
import { filtrarConversas, parseFiltroConversas } from "./filtro-conversas";

const EU = "user-1";

const conversas = [
  { id: "c1", unread_count: 2, candidatos: { atribuido_a: EU } },
  { id: "c2", unread_count: 0, candidatos: { atribuido_a: "user-2" } },
  { id: "c3", unread_count: 1, candidatos: null },
  { id: "c4", unread_count: 0, candidatos: { atribuido_a: EU } },
];

describe("parseFiltroConversas", () => {
  it("aceita os valores válidos e cai em 'todas'", () => {
    expect(parseFiltroConversas("nao-lidas")).toBe("nao-lidas");
    expect(parseFiltroConversas("minhas")).toBe("minhas");
    expect(parseFiltroConversas("qualquer")).toBe("todas");
    expect(parseFiltroConversas(null)).toBe("todas");
  });
});

describe("filtrarConversas", () => {
  it("'todas' devolve tudo", () => {
    expect(filtrarConversas(conversas, "todas", EU)).toHaveLength(4);
  });

  it("'nao-lidas' filtra unread_count > 0", () => {
    expect(filtrarConversas(conversas, "nao-lidas", EU).map((c) => c.id)).toEqual(["c1", "c3"]);
  });

  it("'minhas' filtra candidato.atribuido_a = usuário", () => {
    expect(filtrarConversas(conversas, "minhas", EU).map((c) => c.id)).toEqual(["c1", "c4"]);
  });

  it("'minhas' sem usuário devolve vazio", () => {
    expect(filtrarConversas(conversas, "minhas", null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npx vitest run lib/chat/filtro-conversas.test.ts`
Expected: FAIL — `Cannot find module './filtro-conversas'`.

- [ ] **Step 3: Implementar**

```ts
// lib/chat/filtro-conversas.ts
// Filtro client-side dos chips da Central (Todas / Não lidas / Minhas). Puro.

export type FiltroConversas = "todas" | "nao-lidas" | "minhas";

export function parseFiltroConversas(raw: string | null | undefined): FiltroConversas {
  return raw === "nao-lidas" || raw === "minhas" ? raw : "todas";
}

type ConversaFiltravel = {
  unread_count: number;
  candidatos: { atribuido_a?: string | null } | null;
};

export function filtrarConversas<T extends ConversaFiltravel>(
  conversas: T[],
  filtro: FiltroConversas,
  userId: string | null,
): T[] {
  if (filtro === "nao-lidas") return conversas.filter((c) => (c.unread_count ?? 0) > 0);
  if (filtro === "minhas") {
    if (!userId) return [];
    return conversas.filter((c) => c.candidatos?.atribuido_a === userId);
  }
  return conversas;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx vitest run lib/chat/filtro-conversas.test.ts`
Expected: 5 passed.

- [ ] **Step 5: `listConversations` traz `atribuido_a`**

Em `lib/chat/queries.ts`, trocar:

```ts
export type ConversationWithCandidato = Conversation & {
  candidatos: Pick<Candidato, "nome" | "avatar_url" | "tags" | "telefone"> | null;
};
```

por:

```ts
export type ConversationWithCandidato = Conversation & {
  candidatos: Pick<Candidato, "nome" | "avatar_url" | "tags" | "telefone" | "atribuido_a"> | null;
};
```

E trocar o select:

```ts
    .select("*, candidatos(nome, avatar_url, tags, telefone)")
```

por:

```ts
    .select("*, candidatos(nome, avatar_url, tags, telefone, atribuido_a)")
```

- [ ] **Step 6: Reescrever `components/chat/conversation-list.tsx`**

Substituir o arquivo INTEIRO por (incorpora o header da Task 6 + chips; a Task 11 adiciona o toggle de som):

```tsx
"use client";

import { useState, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { NovaConversaDialog } from "@/components/chat/nova-conversa-dialog";
import { cn } from "@/lib/utils";
import {
  filtrarConversas,
  parseFiltroConversas,
  type FiltroConversas,
} from "@/lib/chat/filtro-conversas";
import type { ConversationWithCandidato } from "@/lib/chat/queries";

// Normalize text for search: lowercase + strip diacritics
function normalize(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return "";
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = Math.floor((now - then) / 1000); // seconds

  if (diff < 60) return "agora";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
  return new Date(dateStr).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

const CHIPS: [FiltroConversas, string][] = [
  ["todas", "Todas"],
  ["nao-lidas", "Não lidas"],
  ["minhas", "Minhas"],
];

interface Props {
  conversations: ConversationWithCandidato[];
  activeId: string | null;
  vagas: string[];
  unidades: { id: string; nome: string }[];
  currentUserId: string | null;
}

export function ConversationList({
  conversations,
  activeId,
  vagas,
  unidades,
  currentUserId,
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtro = parseFiltroConversas(searchParams.get("f"));

  const [query, setQuery] = useState("");
  const [tick, setTick] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Update relative times every 60 seconds
  useEffect(() => {
    intervalRef.current = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Suppress unused-variable warning for tick (it drives re-render for relative times)
  void tick;

  const setFiltro = (f: FiltroConversas) => {
    const params = new URLSearchParams(searchParams.toString());
    if (f === "todas") params.delete("f");
    else params.set("f", f);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  // Mantém o chip ativo ao navegar entre conversas.
  const hrefConversa = (id: string) =>
    filtro === "todas" ? `/chat?c=${id}` : `/chat?c=${id}&f=${filtro}`;

  const filtered = useMemo(() => {
    const porChip = filtrarConversas(conversations, filtro, currentUserId);
    if (!query.trim()) return porChip;
    const q = normalize(query);
    return porChip.filter((c) => {
      const nome = normalize(c.candidatos?.nome ?? "");
      const preview = normalize(c.last_message_preview ?? "");
      const telefone = normalize(c.candidatos?.telefone ?? "");
      return nome.includes(q) || preview.includes(q) || telefone.includes(q);
    });
  }, [conversations, query, filtro, currentUserId]);

  return (
    <div className="flex h-full flex-col border-r border-neutro-200 bg-white">
      {/* Search header */}
      <div className="border-b border-neutro-200 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
          <NovaConversaDialog vagas={vagas} unidades={unidades} />
        </div>
        <input
          type="search"
          placeholder="Buscar candidato..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 w-full rounded-md border border-neutro-200 bg-neutro-50 px-3 text-sm text-neutro-900 placeholder:text-neutro-700 focus:border-sapatao-verde focus:outline-none"
        />
        <div className="mt-2 flex gap-1.5">
          {CHIPS.map(([valor, rotulo]) => (
            <button
              key={valor}
              type="button"
              onClick={() => setFiltro(valor)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                filtro === valor
                  ? "border-sapatao-verde bg-sapatao-verde/10 text-sapatao-verde"
                  : "border-neutro-200 text-neutro-700 hover:bg-neutro-50",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-sm text-neutro-700">
            Nenhuma conversa encontrada.
          </div>
        ) : (
          filtered.map((conv) => {
            const nome = conv.candidatos?.nome ?? "Desconhecido";
            const initial = nome.charAt(0).toUpperCase();
            const isActive = conv.id === activeId;
            const unread = conv.unread_count ?? 0;
            const unreadLabel = unread > 99 ? "99+" : unread > 0 ? String(unread) : null;

            return (
              <Link
                key={conv.id}
                href={hrefConversa(conv.id)}
                className={cn(
                  "flex items-start gap-3 border-b border-neutro-200 px-3 py-3 transition-colors hover:bg-neutro-50",
                  isActive && "bg-neutro-50 border-l-2 border-l-sapatao-verde",
                )}
              >
                <Avatar className="mt-0.5 shrink-0">
                  {conv.candidatos?.avatar_url ? (
                    <AvatarImage src={conv.candidatos.avatar_url} alt={nome} />
                  ) : null}
                  <AvatarFallback className="bg-sapatao-verde text-white text-xs font-semibold">
                    {initial}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-sm font-medium text-neutro-900">{nome}</span>
                    <span className="shrink-0 text-xs text-neutro-700">
                      {relativeTime(conv.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-1">
                    <p className="truncate text-xs text-neutro-700">
                      {conv.last_message_preview ?? "Sem mensagens"}
                    </p>
                    {unreadLabel && (
                      <Badge className="shrink-0 h-4 min-w-[1rem] rounded-full bg-sapatao-verde px-1 text-[10px] text-white">
                        {unreadLabel}
                      </Badge>
                    )}
                  </div>
                  {/* Tags */}
                  {conv.candidatos?.tags && conv.candidatos.tags.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {conv.candidatos.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-neutro-50 border border-neutro-200 px-1.5 py-px text-[10px] text-neutro-700"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: `chat/page.tsx` passa o usuário**

Trocar:

```tsx
        <ConversationList
          conversations={conversations}
          activeId={displayedConvId}
          vagas={vagas}
          unidades={unidades}
        />
```

por:

```tsx
        <ConversationList
          conversations={conversations}
          activeId={displayedConvId}
          vagas={vagas}
          unidades={unidades}
          currentUserId={profile.id}
        />
```

- [ ] **Step 8: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 267 passed (262 + 5); tsc/lint sem erros.

Smoke: `/chat` → chip "Não lidas" mostra só conversas com badge; "Minhas" mostra só as de candidatos atribuídos a você (atribuir pelo painel da Task 5 e conferir); URL reflete `?f=`; navegar entre conversas mantém o chip; busca continua funcionando combinada com o chip.

- [ ] **Step 9: Commit**

```bash
git add sapatao-rh/lib/chat/filtro-conversas.ts sapatao-rh/lib/chat/filtro-conversas.test.ts sapatao-rh/lib/chat/queries.ts sapatao-rh/components/chat/conversation-list.tsx "sapatao-rh/app/(app)/chat/page.tsx"
git commit -m "feat(sp6): chips todas/nao-lidas/minhas na central"
```

---

### Task 11: Notificações globais — badge na sidebar, toast e som opcional

**Files:**
- Create: `sapatao-rh/components/shell/notificacoes-provider.tsx`
- Modify: `sapatao-rh/app/(app)/layout.tsx` (monta o provider com dados iniciais)
- Modify: `sapatao-rh/components/shell/sidebar.tsx` (badge no item Atendimento)
- Create: `sapatao-rh/components/chat/som-toggle.tsx`
- Modify: `sapatao-rh/components/chat/conversation-list.tsx` (toggle no header da Central)

**Interfaces:**
- Produces: `NotificacoesProvider({ empresaId: string | null; conversasIniciais: { id: string; unread_count: number }[]; children })` — 1 canal realtime `notificacoes` (INSERT em `messages` → toast/som; `*` em `conversations` → badge). Padrão anti-StrictMode: flag `cancelled` após CADA await, `.on()` antes de `.subscribe()`, `setAuth` antes (ver `components/chat/realtime.tsx` / `components/funil/realtime.tsx`).
- Produces: `useNaoLidas(): number` (contexto), `UnreadBadge()` (sub-componente client para a sidebar), `SOM_STORAGE_KEY = "sapatao.som-notificacao"`.
- Supressão do toast: lê `window.location` no MOMENTO do evento (evita `useSearchParams` no provider — sem exigência de Suspense) — se `pathname === "/chat"` e `?c=` igual à conversa, não mostra.
- Som: beep curto via WebAudio oscillator (sem asset), só quando `localStorage["sapatao.som-notificacao"] === "1"`; default desligado. `SomToggle` (🔔/🔕) no header da Central.

- [ ] **Step 1: Criar `components/shell/notificacoes-provider.tsx`**

```tsx
"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/browser";

export const SOM_STORAGE_KEY = "sapatao.som-notificacao";

const NotificacoesContext = createContext<{ naoLidas: number }>({ naoLidas: 0 });

export function useNaoLidas(): number {
  return useContext(NotificacoesContext).naoLidas;
}

function somLigado(): boolean {
  try {
    return window.localStorage.getItem(SOM_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Beep curto via WebAudio (sem asset de áudio). Best-effort: o browser pode
 *  bloquear áudio sem interação prévia — falha silenciosa. */
function tocarBeep() {
  try {
    type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    osc.onended = () => void ctx.close();
  } catch {
    // sem áudio — ok
  }
}

type ConversaResumo = { id: string; unread_count: number };

/**
 * Provider global de notificações (montado no layout do grupo (app)):
 * 1 canal realtime compartilhado — INSERT em messages inbound (toast + som) e
 * INSERT/UPDATE em conversations (badge de não-lidas em qualquer tela).
 * Padrão anti-StrictMode do projeto: flag `cancelled` checada após cada await;
 * .on() antes de .subscribe(); setAuth antes de subscrever.
 */
export function NotificacoesProvider({
  empresaId,
  conversasIniciais,
  children,
}: {
  empresaId: string | null;
  conversasIniciais: ConversaResumo[];
  children: ReactNode;
}) {
  const router = useRouter();

  // Mapa conversationId -> unread_count; o badge é a soma.
  const [unreadPorConversa, setUnreadPorConversa] = useState<Map<string, number>>(
    () => new Map(conversasIniciais.map((c) => [c.id, c.unread_count])),
  );
  const naoLidas = [...unreadPorConversa.values()].reduce((soma, n) => soma + n, 0);

  useEffect(() => {
    if (!empresaId) return;
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    async function notificar(conversationId: string, preview: string) {
      // O payload da message não traz o nome — busca via RLS.
      const { data: conv } = await supabase
        .from("conversations")
        .select("candidatos(nome)")
        .eq("id", conversationId)
        .maybeSingle();
      if (cancelled) return;
      const nome =
        (conv as unknown as { candidatos: { nome: string } | null } | null)?.candidatos?.nome ??
        "Novo contato";
      const texto = preview ? preview.slice(0, 80) : "Nova mensagem";
      toast(`${nome}: ${texto}`, {
        action: {
          label: "Abrir",
          onClick: () => router.push(`/chat?c=${conversationId}`),
        },
      });
      if (somLigado()) tocarBeep();
    }

    // Re-aplica o token quando o supabase-js o rotaciona (~1h) — senão o socket
    // realtime silencia depois do refresh (mesmo padrão de funil/realtime.tsx).
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) supabase.realtime.setAuth(session.access_token);
    });

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token); // CRITICAL: senão RLS filtra tudo
      if (cancelled) return;
      channel = supabase
        .channel("notificacoes")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "messages",
            filter: `empresa_id=eq.${empresaId}`,
          },
          (payload) => {
            const row = payload.new as {
              conversation_id?: string;
              direction?: string;
              conteudo?: string | null;
            };
            if (row.direction !== "inbound" || !row.conversation_id) return;
            // Supressão: já estamos na Central com ESTA conversa aberta (?c= igual).
            // Lê a URL no momento do evento — dispensa useSearchParams no provider.
            const url = new URL(window.location.href);
            if (url.pathname === "/chat" && url.searchParams.get("c") === row.conversation_id) {
              return;
            }
            void notificar(row.conversation_id, row.conteudo ?? "");
          },
        )
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "conversations",
            filter: `empresa_id=eq.${empresaId}`,
          },
          (payload) => {
            const row = payload.new as { id?: string; unread_count?: number };
            if (!row.id) return;
            const id = row.id;
            setUnreadPorConversa((atual) => {
              const proximo = new Map(atual);
              proximo.set(id, row.unread_count ?? 0);
              return proximo;
            });
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      authSub.subscription.unsubscribe();
      if (channel) supabase.removeChannel(channel);
    };
  }, [empresaId, router]);

  return (
    <NotificacoesContext.Provider value={{ naoLidas }}>{children}</NotificacoesContext.Provider>
  );
}

/** Badge de não-lidas para o item Atendimento da sidebar. */
export function UnreadBadge() {
  const naoLidas = useNaoLidas();
  if (naoLidas <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-sapatao-verde px-1.5 py-0.5 text-[10px] leading-none font-bold text-white">
      {naoLidas > 99 ? "99+" : naoLidas}
    </span>
  );
}
```

- [ ] **Step 2: Montar o provider no layout**

Em `app/(app)/layout.tsx`, trocar:

```tsx
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
```

por:

```tsx
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { NotificacoesProvider } from "@/components/shell/notificacoes-provider";
```

Trocar:

```tsx
  const supabase = await createClient();
  const { data: unidades } = await supabase
    .from("unidades")
    .select("*")
    .order("nome");
```

por:

```tsx
  const supabase = await createClient();
  const [{ data: unidades }, { data: conversas }] = await Promise.all([
    supabase.from("unidades").select("*").order("nome"),
    // Soma inicial de não-lidas para o badge (RLS: papéis sem acesso a
    // conversations recebem [] e o badge simplesmente não aparece).
    supabase.from("conversations").select("id, unread_count"),
  ]);
```

E trocar o retorno:

```tsx
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={profile.role} profile={profile} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Suspense
          fallback={<div className="h-14 shrink-0 border-b border-neutro-200 bg-card" />}
        >
          <Topbar profile={profile} unidades={visiveis} />
        </Suspense>
        <main className="flex-1 overflow-hidden bg-neutro-50">{children}</main>
      </div>
      <Toaster />
    </div>
  );
```

por:

```tsx
  return (
    <NotificacoesProvider
      empresaId={profile.empresa_id}
      conversasIniciais={
        (conversas ?? []) as { id: string; unread_count: number }[]
      }
    >
      <div className="flex h-screen overflow-hidden">
        <Sidebar role={profile.role} profile={profile} />
        <div className="flex flex-1 flex-col overflow-hidden">
          <Suspense
            fallback={<div className="h-14 shrink-0 border-b border-neutro-200 bg-card" />}
          >
            <Topbar profile={profile} unidades={visiveis} />
          </Suspense>
          <main className="flex-1 overflow-hidden bg-neutro-50">{children}</main>
        </div>
        <Toaster />
      </div>
    </NotificacoesProvider>
  );
```

- [ ] **Step 3: Badge na sidebar**

Em `components/shell/sidebar.tsx`, trocar:

```tsx
import { navItemsForRole } from "@/lib/auth/rbac";
import type { Profile, Role } from "@/types/database";
import { cn } from "@/lib/utils";
```

por:

```tsx
import { navItemsForRole } from "@/lib/auth/rbac";
import { UnreadBadge } from "@/components/shell/notificacoes-provider";
import type { Profile, Role } from "@/types/database";
import { cn } from "@/lib/utils";
```

E trocar (dentro do map dos itens):

```tsx
              <Icon className={cn("size-[18px]", active ? "text-brand-700" : "text-neutro-500")} />
              {item.label}
            </Link>
```

por:

```tsx
              <Icon className={cn("size-[18px]", active ? "text-brand-700" : "text-neutro-500")} />
              {item.label}
              {item.key === "chat" && <UnreadBadge />}
            </Link>
```

- [ ] **Step 4: Toggle de som no header da Central**

Criar `components/chat/som-toggle.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { Bell, BellOff } from "lucide-react";
import { SOM_STORAGE_KEY } from "@/components/shell/notificacoes-provider";

/** Toggle de som das notificações (por dispositivo, localStorage; default OFF).
 *  Inicializa em false e sincroniza no effect para evitar mismatch de hidratação. */
export function SomToggle() {
  const [ligado, setLigado] = useState(false);

  useEffect(() => {
    setLigado(window.localStorage.getItem(SOM_STORAGE_KEY) === "1");
  }, []);

  const alternar = () => {
    const proximo = !ligado;
    setLigado(proximo);
    window.localStorage.setItem(SOM_STORAGE_KEY, proximo ? "1" : "0");
  };

  return (
    <button
      type="button"
      onClick={alternar}
      aria-label={ligado ? "Desligar som de notificação" : "Ligar som de notificação"}
      title={ligado ? "Som de notificação: ligado" : "Som de notificação: desligado"}
      className="flex size-7 items-center justify-center rounded-md text-neutro-700 transition-colors hover:bg-neutro-100"
    >
      {ligado ? <Bell className="size-4" /> : <BellOff className="size-4" />}
    </button>
  );
}
```

Em `components/chat/conversation-list.tsx`, trocar:

```tsx
import { NovaConversaDialog } from "@/components/chat/nova-conversa-dialog";
```

por:

```tsx
import { NovaConversaDialog } from "@/components/chat/nova-conversa-dialog";
import { SomToggle } from "@/components/chat/som-toggle";
```

E trocar o header:

```tsx
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
          <NovaConversaDialog vagas={vagas} unidades={unidades} />
        </div>
```

por:

```tsx
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="font-display text-sm font-semibold text-neutro-900">Atendimento</h2>
          <div className="flex items-center gap-1.5">
            <SomToggle />
            <NovaConversaDialog vagas={vagas} unidades={unidades} />
          </div>
        </div>
```

- [ ] **Step 5: Suíte + tsc + smoke manual**

Run:
```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run test; npx tsc --noEmit; npm run lint
```
Expected: 267 passed; tsc/lint sem erros. (O teste existente `components/realtime-strictmode.test.tsx` continua verde — o provider segue o mesmo padrão de canal.)

Smoke (dev server + supabase no ar; simule um inbound com o webhook — instância/secret de teste como no plano SP1d):

```powershell
docker exec supabase_db_qysnyiufifgldieqnsly psql -U postgres -d postgres -c "update whatsapp_instances set uazapi_instance_id='inst-teste', webhook_secret='s3cr3t' where true returning id;"
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/whatsapp/webhook/inst-teste?secret=s3cr3t" -ContentType "application/json" -Body '{"event":"messages","instance":"inst-teste","message":{"messageid":"NOTIF-1","chatid":"5551999000077@s.whatsapp.net","fromMe":false,"messageType":"text","text":"oi, quero a vaga!","senderName":"Notif Teste","wasSentByApi":false}}'
```

1. Estando no `/dashboard`: toast "Notif Teste: oi, quero a vaga!" com ação "Abrir" (navega para a conversa) + badge numérico aparece em "Atendimento" na sidebar.
2. Estando em `/chat?c={essa conversa}`: NENHUM toast (supressão).
3. Ligar o 🔔 no header da Central e disparar outro evento (mude `messageid`) → beep curto toca; desligar → silêncio. Preferência sobrevive a F5 (localStorage).
4. Abrir a conversa → badge da sidebar decrementa (unread_count zera via mark-read → UPDATE de conversations chega no canal).
5. Rodar com React Strict Mode (dev): sem toasts duplicados nem erro "tried to subscribe multiple times".

- [ ] **Step 6: Commit**

```bash
git add sapatao-rh/components/shell/notificacoes-provider.tsx "sapatao-rh/app/(app)/layout.tsx" sapatao-rh/components/shell/sidebar.tsx sapatao-rh/components/chat/som-toggle.tsx sapatao-rh/components/chat/conversation-list.tsx
git commit -m "feat(sp6): notificacoes globais - badge na sidebar, toast e som opcional"
```

---

### Task 12: Gate final — suíte, lint, tsc, build e verify:sp1d

**Files:** nenhum novo (só correções que surgirem).

- [ ] **Step 1: Rodar tudo**

```powershell
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"
npm run test        # esperado: 267 passed (237 da base + 30 novos), 0 falhas
npm run lint        # esperado: 0 erros
npx tsc --noEmit    # esperado: 0 erros
npm run build       # esperado: build OK (atenção a useSearchParams/Suspense)
```

- [ ] **Step 2: Regressão do fluxo inbound (verify:sp1d) com o app da SP6 rodando**

Em um terminal, subir o dev server DESTE worktree; em outro, rodar o verify:

```powershell
# terminal 1
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run dev
# terminal 2
Set-Location "C:\Users\lucaw\AppData\Local\Temp\claude\sp6-wt\sapatao-rh"; npm run verify:sp1d
```
Expected: `N ok, 0 falhas`, exit 0 — nenhuma regressão no fluxo inbound (critério §9.7 da spec). Se falhar: diagnosticar ANTES de seguir.

- [ ] **Step 3: Smoke de ponta a ponta da jornada (critérios §9)**

1. Cadastrar candidato manual em `/candidatos` e em `/funil` → 1ª etapa do funil; duplicado oferece "Abrir ficha existente" (§9.1).
2. Iniciar conversa da ficha/modal/Central → composer com saudação preenchida (`{{nome}}` resolvido) e editável; envio real ok (§9.2).
3. Picker insere conteúdo preenchido; Config>Templates CRUD como admin (§9.3).
4. No painel do chat: mover etapa (confirmação nas críticas), tags, vaga, responsável, editar dados; telefone travado com conversa; "Ver no funil" navega (§9.4).
5. Kanban filtra por busca/vaga/resp/meus/unidade via URL; topbar filtra de verdade; contadores refletem (§9.5).
6. Central filtra Todas/Não lidas/Minhas; badge global; toast fora da conversa aberta; som só com toggle (§9.6).

- [ ] **Step 4: Corrigir o que aparecer e commitar**

```bash
git add -A
git commit -m "chore(sp6): gate final - suite, lint, tsc e build verdes"
```

(Se nada mudou, pular o commit.)

