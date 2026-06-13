# SP1a — Fundação + Recebimento (Central de Atendimento) · Design / Spec

**Produto:** Sapatão RH · **Fatia:** SP1a (primeira de três da SP1 — Central de Atendimento WhatsApp via UAZAPI)
**Data:** 2026-06-13 · **Status:** Aprovado para implementação
**Base:** SP0 (Fundação) concluída. PRD §7.3, §8, §9.1, §10.1. Blueprint: [Uazapi docs/espelho-atendimento-uazapi.md](../../../Uazapi%20docs/espelho-atendimento-uazapi.md). API: [Uazapi docs/uazapi-openapi-spec.yaml](../../../Uazapi%20docs/uazapi-openapi-spec.yaml).

---

## 1. Contexto e objetivo

A SP1 (Central de Atendimento) é grande demais para uma fatia. Foi dividida em três:
- **SP1a — Fundação + Recebimento** *(esta spec)*: a espinha — tabelas, RLS, realtime, storage, conexão da instância (QR), webhook e pipeline de **entrada**, auto-criação de candidato, lista de conversas + thread **somente leitura** em tempo real.
- SP1b — Envio + fila otimista (composer, `/api/whatsapp/send`, status forward-only, marcar lida).
- SP1c — Mídia nas duas vias (download assíncrono, envio de mídia/documento, botão "Analisar Currículo").

**Objetivo da SP1a / demo:** o candidato manda uma mensagem de texto para o número do RH → ela aparece na plataforma em **≤ 3s**, e o candidato vira um **registro** (`candidatos`). É a integração mais arriscada (roteamento de webhook, realtime+RLS, dedup) e por isso vai primeiro.

---

## 2. Decisões adotadas (da análise de escopo)

| # | Decisão | Escolha (SP1a) |
|---|---------|----------------|
| Tenancy | Multi-empresa estrutural | `empresa_id` + RLS em tudo (padrão SP0); fluxo otimizado para 1 empresa / 1 número. Roteia por `uazapi_instance_id` → escala para N sem mudar schema. |
| Webhook auth | Sem HMAC documentado na UAZAPI v2 | Rota `/api/whatsapp/webhook/[instanceId]`; resolve a instância por `uazapi_instance_id`; valida um `webhook_secret` por instância (no path ou no body token). HMAC fica como upgrade **só após** confirmar no gateway real. |
| Token da instância | `uazapi_token` é bearer de controle total | Coluna texto; **revogado** o `select` da coluna para `authenticated`/`anon` (browser não lê); lido só pelo server via `createAdminClient()`. View `whatsapp_instances_safe` (security_invoker) para a UI. pgsodium/Vault = hardening futuro. |
| Candidato inicial | etapa na auto-criação | `etapa` texto livre default `'triagem'`; FK para `funil_etapas` e criação de card no kanban ficam para a fatia do Funil. O registro aparecendo já satisfaz a SP1a. |
| Envio | origem do envio | `POST /api/whatsapp/send` + fila Zustand — **SP1b** (na SP1a a thread é só leitura; composer aparece desabilitado). |
| Triagem | manual vs automática | **Manual**: `message_templates` semeados; recrutador insere no composer. Auto-preenchimento de campos = fatia futura. |

---

## 3. Modelo de dados (migrations 0005–0009)

Convenções SP0: `empresa_id uuid not null references public.empresas(id) on delete cascade`, índice `_empresa_idx`, trigger `update_updated_at()`, RLS habilitado. Aplicar via `npm run migrate` (runner `pg`). Helpers RLS (`current_empresa_id()`, `current_user_role()`, `is_platform_admin()`) **reutilizados** da migration 0002 — nunca redefinir.

### 0005_whatsapp_tables.sql

```sql
-- Instância WhatsApp (1 por empresa — número único compartilhado)
create table public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null default 'WhatsApp RH',
  uazapi_instance_id text unique,
  uazapi_token text,                       -- SENSÍVEL: nunca exposto ao browser
  webhook_secret text not null default replace(gen_random_uuid()::text,'-',''),
  status text not null default 'desconectado'
    check (status in ('conectado','desconectado','qr_pendente','connecting')),
  phone_number text,
  connected_at timestamptz, last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index whatsapp_instances_one_per_empresa on public.whatsapp_instances(empresa_id);
create trigger whatsapp_instances_updated before update on public.whatsapp_instances
  for each row execute function public.update_updated_at();

-- Candidatos (entidade de domínio de 1ª classe — modelo do PRD)
create table public.candidatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null default 'Desconhecido',
  telefone text not null,                  -- só dígitos, sem '+'
  cpf text, cep text, idade int, endereco text, tem_veiculo boolean,
  vaga_interesse text,
  unidade_id uuid references public.unidades(id) on delete set null,
  etapa text not null default 'triagem',
  origem text not null default 'whatsapp',
  avatar_url text,
  tags text[] not null default '{}',
  notas_internas text,
  atribuido_a uuid references public.profiles(id) on delete set null,
  score_ia int, parecer_ia jsonb,          -- reservados p/ SP3
  curriculo_url text,                      -- reservado p/ SP1c
  status text not null default 'ativo'
    check (status in ('ativo','contratado','reprovado','desistente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, telefone)            -- chave de upsert do webhook
);
create index candidatos_empresa_idx on public.candidatos(empresa_id);
create trigger candidatos_updated before update on public.candidatos
  for each row execute function public.update_updated_at();

-- Conversas (1 por candidato)
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','arquivada')),
  atribuida_a uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  unread_count int not null default 0,
  uazapi_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, candidato_id)
);
create index conversations_empresa_last_idx on public.conversations(empresa_id, last_message_at desc nulls last);
create trigger conversations_updated before update on public.conversations
  for each row execute function public.update_updated_at();

-- Mensagens (append-only; status atualizado in place)
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uazapi_msg_id text,                      -- id do provider (dedup inbound)
  client_message_id uuid,                  -- idempotência outbound (SP1b)
  direction text not null check (direction in ('inbound','outbound')),
  tipo text not null default 'text'
    check (tipo in ('text','image','audio','video','document','ptt','sticker','system')),
  conteudo text,
  midia_url text, midia_mime text, thumbnail_url text,   -- preenchidos na SP1c
  status text not null default 'sent'
    check (status in ('queued','sent','delivered','read','failed')),
  sender_id uuid references public.profiles(id) on delete set null,  -- null = inbound
  reply_to_provider_id text,
  metadata jsonb not null default '{}'::jsonb,
  enviada_em timestamptz not null default now(),
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index messages_empresa_idx on public.messages(empresa_id);
-- dedup duplo (mecânica do espelho):
create unique index messages_inbound_dedup  on public.messages(empresa_id, uazapi_msg_id)    where uazapi_msg_id is not null;
create unique index messages_outbound_dedup on public.messages(empresa_id, client_message_id) where client_message_id is not null;

-- Templates de triagem (PRD)
create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null, categoria text,
  conteudo text not null, variaveis text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index message_templates_empresa_idx on public.message_templates(empresa_id);
create trigger message_templates_updated before update on public.message_templates
  for each row execute function public.update_updated_at();

-- Opt-out
create table public.whatsapp_optouts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  telefone text not null, motivo text,
  created_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);
```

### 0006_on_new_message.sql — trigger (replicar do espelho)

```sql
create or replace function public.on_new_message()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.conversations set
    last_message_at = new.created_at,
    last_message_preview = left(coalesce(new.conteudo, initcap(new.tipo)), 120),
    last_message_direction = new.direction,
    unread_count = case when new.direction = 'inbound' then unread_count + 1 else unread_count end,
    updated_at = now()
  where id = new.conversation_id;
  return new;
end; $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_new_message();
```
> Este trigger é o que faz o evento realtime de `conversations` disparar e a lista reordenar **sem código de app**.

### 0007_whatsapp_rls.sql — RLS (padrão SP0)

Habilitar RLS nas 6 tabelas. Para `candidatos`, `conversations`, `messages`, `message_templates`, `whatsapp_optouts`:
- **select**: `using (empresa_id = public.current_empresa_id() or public.is_platform_admin())`
- **write (all)**: `using/with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())`

Para `whatsapp_instances`: select igual; **write só admin** (`current_user_role() = 'admin'`).
Usuários autenticados **nunca** inserem em `messages`/`conversations`/`candidatos` direto — quem escreve é o **webhook/send service via service role** (bypassa RLS). As policies de write existem para edições pontuais (tags, notas, status) por admin/rh.

**Proteção do token (decisão 2):**
```sql
revoke select on public.whatsapp_instances from anon, authenticated;
grant  select (id, empresa_id, nome, uazapi_instance_id, webhook_secret, status,
               phone_number, connected_at, last_seen_at, created_at, updated_at)
  on public.whatsapp_instances to authenticated;   -- exclui uazapi_token
create view public.whatsapp_instances_safe with (security_invoker = true) as
  select id, empresa_id, nome, uazapi_instance_id, status, phone_number,
         connected_at, last_seen_at, created_at, updated_at
  from public.whatsapp_instances;
```
> A UI lê a view (sem token). PostgREST do client deve selecionar colunas explícitas (não `*`). O `uazapi_token` só é lido server-side pelo admin client.

### 0008_realtime.sql

```sql
alter publication supabase_realtime add table public.conversations;
alter publication supabase_realtime add table public.messages;
```
> Realtime herda RLS — as tabelas têm `empresa_id` + policy de select (ok). Habilitar o **Custom Access Token Hook** (migration 0003) no dashboard melhora a latência (senão cada entrega de evento faz o fallback de `profiles`).

### 0009_storage.sql — buckets + RLS

Buckets privados `whatsapp-media` (mídia de chat, path `{empresa_id}/{conversation_id}/{messageId}.{ext}`) e `curriculos` (CVs). RLS no `storage.objects`: select onde `(storage.foldername(name))[1] = public.current_empresa_id()::text`; insert idem para admin/rh; uploads do webhook via service role (bypassa). *(Buckets são criados na SP1a; o uso efetivo de mídia é SP1c.)*

### Seed (estender `supabase/seed.mjs`)
- 1 `whatsapp_instances` para a Estação Sapatão (sem token/instância ainda — preenchido ao conectar).
- `message_templates` de triagem: Idade ≥18, CEP, Veículo próprio, Vaga de interesse, Pede currículo.

---

## 4. Integração UAZAPI

**Auth:** dois esquemas de header — `admintoken` (criar instância) e `token` por instância (resto). **Sem** prefixo `Bearer`.

**Endpoints SP1a** (`lib/uazapi/client.ts`):
- `POST /instance/create` (admintoken) → salva o `token` retornado por instância.
- `POST /instance/connect` (token) → sem `phone`: QR (`data:image/png;base64` em `instance.qrcode`, expira ~2min); com `phone`: pairing code.
- `GET /instance/status` (token) → normaliza status.
- `POST /instance/disconnect` (token).
- `POST /webhook` (token) → registra: `{ enabled:true, url, events:["messages","messages_update","connection"], excludeMessages:["wasSentByApi"] }`.

**Extrator tolerante** (`lib/uazapi/extract.ts`, replicar do espelho): os campos da UAZAPI variam entre versões (o OpenAPI deixa o webhook como mapa genérico). Normalizar defensivamente: id de envio `.messageid → .id → .key.id → .message.key.id`; QR `instance.qrcode → qrcode → qrCode → base64`; status **case-insensitive** (UAZAPI emite Title Case `Read`/`Delivered`/`Sent`) → `sent|delivered|read|failed|deleted`. O parser do espelho é a fonte de verdade dos nomes de campo; o OpenAPI é a fonte dos payloads de request.

**Parser de webhook** (`lib/uazapi/webhook-parser.ts`): transforma o payload bruto numa união discriminada `UazapiEvent` (`message | status | connection | ignore`) com as normalizações críticas:
1. `contactName` vem **sempre** do objeto `chat` (`chat.wa_name → chat.wa_contactName → chat.name`), **nunca** de `senderName` quando `fromMe` (senão o nome do recrutador sobrescreve o do candidato).
2. Status em Title Case → normalizar com mapa case-insensitive.
3. `wasSentByApi` para descartar eco de mensagens próprias.

---

## 5. Webhook + pipeline de entrada

### Correção obrigatória do proxy (risco confirmado)
O `proxy.ts` (matcher atual) intercepta `/api/whatsapp/webhook/*`, roda `updateSession`, não acha usuário e **redireciona para /login** — quebrando o webhook. **Adicionar `api/` (ou a rota do webhook) às exclusões do matcher** antes de qualquer recebimento.

### Rota `POST /api/whatsapp/webhook/[instanceId]/route.ts`
- Lê `params` (Next 16: `params` é Promise → `await params`).
- **Sempre retorna 200** (erros só logados — evita retry storm).
- Resolve a instância: `createAdminClient()` (não há JWT) → `SELECT ... from whatsapp_instances where uazapi_instance_id = instanceId` → `{ empresa_id, uazapi_token, webhook_secret }`. Instância desconhecida → **200 silencioso** (não vazar existência).
- Valida `webhook_secret` (path/body).

### Pipeline do evento `message` (entrada) — tudo via service role
```
1. SKIP se outbound && wasSentByApi      (eco da própria API)
2. SKIP se sem provider id                (sem dedup)
3. resolve instância → empresa_id         (não achou → 200 silencioso)
4. upsert candidato por (empresa_id, telefone):
     nome ← contactName (do chat, nunca senderName quando fromMe);
     se novo: etapa='triagem', origem='whatsapp', avatar_url
5. upsert conversation por (empresa_id, candidato_id) (instance_id setado)
6. insert message (dedup por uazapi_msg_id; índice único + handler 23505)
     → trigger on_new_message → realtime dispara
7. after() (assíncrono, não bloqueia o 200):
     - detectar opt-out (regex PARAR/SAIR/STOP) → insert whatsapp_optouts
     - (mídia → download: SP1c)
8. return 200 { ok:true }
```
Eventos `connection` → atualiza `whatsapp_instances.status`. Eventos `messages_update` (status) → SP1b.

**Telefone**: normalizar para só dígitos (JID bruto → dígitos) — chave de dedup do candidato.

---

## 6. UI da instância (Configurações > WhatsApp) — admin

Página `app/(app)/configuracoes/whatsapp/page.tsx` (guard admin via `getCurrentProfile` + `canAccessPath`):
- Estado da instância (status, número conectado), via `whatsapp_instances_safe`.
- Botão **Conectar** → server action chama `/instance/create` (se preciso) + `/instance/connect` → exibe **QR** (polling de status a cada 5s enquanto `qr_pendente`/`connecting`; 60s quando conectado). Registra o webhook (`/webhook`) ao conectar.
- Botão **Desconectar**.
> Precisa das credenciais UAZAPI (admintoken + URL) em env (`UAZAPI_API_URL`, `UAZAPI_ADMIN_TOKEN`) para funcionar ao vivo. Sem elas, a UI existe mas a conexão real fica pendente.

---

## 7. UI do chat (somente leitura) + realtime

`app/(app)/chat/page.tsx` deixa de ser placeholder e vira o shell de 3 colunas (full-height — resolver a tensão do `p-6` do layout do app com um container `h-full overflow-hidden`, sem hacks de margem negativa).

- **Esquerda (~320px) — Lista de conversas**: server entrega a lista completa (RLS-scoped, `order by last_message_at desc`); busca/filtro 100% client-side (`useMemo`); card = avatar/inicial + nome + tempo relativo + preview + badge de não-lidas (cap 99+); busca normalizada (lowercase + strip de acentos) sobre nome/telefone/preview.
- **Centro (flex-1) — Thread (read-only na SP1a)**: server entrega as últimas ~60 msgs (`order by created_at desc limit 61` → `hasMore` → reverter); scroll infinito via IntersectionObserver. `key={conversationId}` reseta ao trocar de conversa. Composer **visível mas desabilitado** ("Envio chega na próxima etapa").
- **Direita (xl+, colapsável) — Painel do candidato**: dados básicos, vaga de interesse, score IA (placeholder SP3), tags, notas internas.
- **Realtime** (`components/chat/realtime.tsx`, client): **autenticar o socket antes de assinar** — `const {data}=await supabase.auth.getSession(); await supabase.realtime.setAuth(data.session.access_token)` (senão o canal é `anon` e a RLS filtra TUDO silenciosamente). Um canal, duas subscriptions `postgres_changes` (`event:'*'`) em `messages` e `conversations`, ambas com `filter: empresa_id=eq.${empresaId}`. Qualquer evento → `router.refresh()`. `removeChannel` no unmount.

---

## 8. Reuso da SP0

Reutilizar **exatamente** (não reinventar): helpers RLS (0002), shape das policies (copiar `unidades_*`), convenções de tabela (0001), runner de migration, clients supabase (`browser`/`server`/`admin`), `getCurrentProfile` + `rbac`, padrão de `types/database.ts`, `lib/validations/*` (Zod 4), Zustand 5, shadcn/Base UI + tokens, shell. **AGENTS.md**: Next 16 (proxy.ts; `params`/`cookies()`/`headers()` async) — ler `node_modules/next/dist/docs/` antes de rotas/layouts.

Adições: `WhatsappInstance`, `Candidato`, `Conversation`, `Message`, `MessageTemplate` em `types/database.ts`; `lib/validations/whatsapp.ts`.

---

## 9. Testes (TDD)

Lógica de negócio testável (Vitest, meta ≥60%):
- **Extrator tolerante**: cada caminho de fallback (id, qr, status case-insensitive) + entradas malformadas.
- **Webhook parser**: normalização de `contactName` (chat vs senderName quando fromMe), status Title Case, `wasSentByApi`, evento `ignore`.
- **Normalização de telefone** (JID → dígitos) + chave de dedup.
- **Detecção de opt-out** (regex PARAR/SAIR/STOP, case-insensitive).
- **Pipeline de entrada** (função pura/injeção de client mockado): upsert candidato (novo vs existente, nome correto), upsert conversation, insert message com dedup (segundo evento mesmo `uazapi_msg_id` = no-op), skip de eco.
- **RBAC**: `canAccessPath` para `/chat` (admin/rh sim; viewer não) e `/configuracoes/whatsapp` (admin).
- Webhook route: 200 sempre (inclusive instância desconhecida e payload inválido).

---

## 10. Fronteira de escopo (o que NÃO é SP1a)

- **Envio** (composer funcional, `/api/whatsapp/send`, fila otimista, status forward-only, marcar lida) → **SP1b**.
- **Mídia** (download assíncrono inbound, envio de mídia/documento, botão "Analisar Currículo", preview objectURL) → **SP1c**.
- Plantão/roleta, transferências, grupos, reações/edição/exclusão, agendadas, anti-ban, transcrição → fatias futuras / fora.
- Criação de card no Kanban / FK `funil_etapas` → fatia do Funil.
- Automação da triagem (parse de respostas) → fatia futura.

---

## 11. Critérios de aceitação (SP1a)

1. Migrations 0005–0009 aplicam limpo via `npm run migrate`; RLS habilitada nas 6 tabelas; realtime publica `conversations`/`messages`; buckets criados.
2. `uazapi_token` **não** é selecionável por `authenticated` (verificável); a UI usa `whatsapp_instances_safe`.
3. `proxy.ts` **não** intercepta `/api/whatsapp/webhook/*` (webhook recebe POST).
4. **Simulação de webhook** (POST de payload UAZAPI fake na rota): cria candidato (nome do `chat`), cria conversa, insere mensagem; segundo POST com mesmo `uazapi_msg_id` = sem duplicar; eco (`wasSentByApi`) ignorado; instância desconhecida = 200 silencioso.
4b. Opt-out: inbound "PARAR" registra em `whatsapp_optouts`.
5. UI de chat: lista de conversas e thread renderizam; realtime atualiza a lista ao chegar nova mensagem (testável inserindo uma mensagem via service role e observando o `router.refresh`).
6. Página Configurações > WhatsApp existe (admin-only) e mostra status; conectar/QR funciona quando as credenciais UAZAPI estão em env (verificação ao vivo pelo usuário).
7. Testes ≥60% na lógica listada em §9; `tsc` limpo; `npm run build` OK.

---

## 12. Riscos & mitigações (da análise)

| Risco | Mitigação |
|-------|-----------|
| Proxy redireciona o webhook | Excluir `api/` do matcher do `proxy.ts` (corrigir já). |
| Realtime sem `setAuth` → RLS filtra tudo silenciosamente | `supabase.realtime.setAuth(token)` antes de assinar. |
| Mídia não vem no webhook (só o id) | Download via `/message/download` no `after()` — **SP1c**; na SP1a, mensagem de mídia registra o tipo sem baixar. |
| `uazapi_token` exposto ao browser | Revogar `select` da coluna + view sem token; token só server-side. |
| Webhook auth (HMAC assumido) | Roteia por `uazapi_instance_id` + valida `webhook_secret`; HMAC só após confirmar no gateway. |
| Dedup (redelivery/retry) | 2 índices únicos parciais + handler 23505 (re-SELECT). |
| Eco de mensagens próprias | `excludeMessages:['wasSentByApi']` no registro + re-checagem `outbound && wasSentByApi` na rota. |
| `contactName` errado | Sempre do objeto `chat`, nunca `senderName` quando `fromMe`. |
| Next 16 não-padrão | `params` é Promise; `proxy.ts`; `force-dynamic` na página de chat; ler docs em `node_modules`. |
| Layout full-height vs `p-6` | Container interno `h-full overflow-hidden`, sem margens negativas. |
| Supabase IPv6/pooler | `migrate.mjs` usa a conexão direta (já validada nesta máquina). |

---

**Fim — SP1a Design v1.0**
