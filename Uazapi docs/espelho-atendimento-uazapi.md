# Espelho de Implementação — Central de Atendimento WhatsApp (UAZAPI)

> **Propósito deste documento**: blueprint completo e auto-contido do sistema de atendimento (envio/recebimento de mensagens WhatsApp via UAZAPI) do First360 CRM, para ser usado como **espelho de estrutura** ao implementar um canal de atendimento equivalente em outro CRM.
>
> **Stack de origem**: Next.js 16 (App Router, Server Components + Server Actions) · React 19 · Supabase (Postgres + Auth + Storage + Realtime) · UAZAPI v2 (gateway WhatsApp) · Tailwind 4 + shadcn/ui.
>
> Os caminhos de arquivo citados referem-se ao repositório de origem e servem de referência cruzada — a lógica descrita é o que importa replicar.

---

## Sumário

1. [Arquitetura geral](#1-arquitetura-geral)
2. [Modelo de dados (DDL completo)](#2-modelo-de-dados-ddl-completo)
3. [Integração UAZAPI — client e endpoints](#3-integração-uazapi--client-e-endpoints)
4. [Instâncias WhatsApp — ciclo de vida](#4-instâncias-whatsapp--ciclo-de-vida)
5. [Recebimento de mensagens (webhook)](#5-recebimento-de-mensagens-webhook)
6. [Envio de mensagens — pipeline do servidor](#6-envio-de-mensagens--pipeline-do-servidor)
7. [Fluidez do envio — fila otimista no cliente](#7-fluidez-do-envio--fila-otimista-no-cliente) ⭐
8. [Layout e estrutura da UI](#8-layout-e-estrutura-da-ui)
9. [Composer — todos os recursos](#9-composer--todos-os-recursos)
10. [Realtime](#10-realtime)
11. [Recursos do produto](#11-recursos-do-produto)
12. [Permissões e visibilidade (RBAC + RLS)](#12-permissões-e-visibilidade-rbac--rls)
13. [Decisões de design e gotchas](#13-decisões-de-design-e-gotchas)
14. [Checklist de implementação em outro CRM](#14-checklist-de-implementação-em-outro-crm)

---

## 1. Arquitetura geral

### 1.1 Camadas

```
┌──────────────────────────────────────────────────────────────────┐
│ FRONTEND (React 19, Client Components)                           │
│  página /atendimento (3 colunas)                                 │
│  ├─ ConversationList   (filtros, busca, badges, realtime)        │
│  ├─ ConversationThread (janela de msgs, infinite scroll, bolhas) │
│  ├─ Composer           (texto, mídia, áudio, stickers, menções)  │
│  ├─ SendQueue          (fila local otimista — module-level store)│
│  └─ AtendimentoRealtime (assina postgres_changes → refresh)      │
├──────────────────────────────────────────────────────────────────┤
│ SERVER ACTIONS (Next.js, ~28 actions)                            │
│  validam capability + escopo rw/ro → chamam lib → auditam        │
├──────────────────────────────────────────────────────────────────┤
│ BACKEND DE ATENDIMENTO (src/lib/atendimento/)                    │
│  send.ts (pipeline de envio) · inbox.ts (listagens) ·            │
│  visibilidade.ts (RBAC) · agendadas, reações, stickers, etc.     │
├──────────────────────────────────────────────────────────────────┤
│ ADAPTER WHATSAPP (src/lib/whatsapp/)                             │
│  uazapi.ts (client HTTP) · webhook-parser.ts (normalização) ·    │
│  media.ts (download/upload) · instances.ts (ciclo de vida)       │
├──────────────────────────────────────────────────────────────────┤
│ WEBHOOK ROUTE (/api/whatsapp/webhook/[secret])                   │
│  recebe eventos UAZAPI → parse → persiste → side effects async   │
├──────────────────────────────────────────────────────────────────┤
│ BANCO (Supabase Postgres)                                        │
│  conversations · messages (+ trigger on_new_message) ·           │
│  whatsapp_instances · RLS por tenant/privacidade ·               │
│  Realtime publication · Storage bucket privado                   │
└──────────────────────────────────────────────────────────────────┘
         ▲                                        │
         │ webhook (messages, connection,         │ POST /send/text,
         │ messages_update, chats)                ▼ /send/media, etc.
┌──────────────────────────────────────────────────────────────────┐
│ UAZAPI v2 (gateway WhatsApp) — 1 conta de plataforma,            │
│ N instâncias (1 por número conectado), token por instância       │
└──────────────────────────────────────────────────────────────────┘
```

### 1.2 Princípios estruturais

- **Modelo channel-agnostic**: `conversations` e `messages` têm coluna `channel` (`whatsapp | whatsapp_group | instagram | facebook`). Tudo específico de WhatsApp (instância, QR, warmup, opt-out) fica isolado no adapter `src/lib/whatsapp/`. Novos canais = novos adapters, sem tocar no inbox.
- **Dois tipos de instância**: `personal` (número pessoal do corretor, 1 por user) e `global` (número compartilhado de plantão, distribuído por roleta). A coluna `conversations.source` denormaliza o tipo para filtro rápido.
- **Fluidez no cliente, confiabilidade no servidor**: o servidor sempre grava-primeiro (`queued`) → chama o provider → atualiza (`sent`/`failed`). A velocidade percebida vem 100% de uma fila otimista no cliente. As duas camadas são independentes (ver §7).
- **Side effects são best-effort e assíncronos**: download de mídia, avatar, contadores, automações e distribuição rodam via `after()` (waitUntil) — nunca bloqueiam a resposta HTTP nem o envio.
- **Defesa em profundidade**: a visibilidade de conversas é aplicada em 2 camadas — função pura no app (`nivelAcessoConversa`) E políticas RLS no Postgres (mesma regra espelhada).
- **Webhook sempre responde 200**: erros são logados, nunca propagados — evita retry storm do provider.

### 1.3 Fluxo macro

**Recebimento**: UAZAPI → `POST /api/whatsapp/webhook/<secret>` → valida secret → parser normaliza evento → resolve instância→tenant → upsert `conversations` → insert `messages` (trigger atualiza preview/unread) → `after()`: baixa mídia, cacheia avatar, dispara automações/roleta → Realtime emite o INSERT → todos os clients do tenant fazem `router.refresh()`.

**Envio**: usuário aperta Enter → bolha otimista aparece **na hora** (fila local) → worker da fila chama a server action → action valida tudo, INSERT `queued`, chama UAZAPI, UPDATE `sent` → realtime/refresh traz a row real → merge por `client_message_id` substitui a bolha otimista → ticks de entrega (`delivered`/`read`) chegam depois via webhook `messages_update`.

---

## 2. Modelo de dados (DDL completo)

> Postgres/Supabase. `update_updated_at()` é uma função-trigger genérica que seta `updated_at = now()`. Adapte `auth.jwt()` ao seu provedor de auth se não usar Supabase.

### 2.1 `platform_integrations` — config global do provider (sem tenant)

```sql
CREATE TABLE platform_integrations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider                TEXT NOT NULL UNIQUE,            -- 'uazapi'
  base_url                TEXT,
  admin_token_encrypted   TEXT,                            -- AES-256-GCM em repouso
  webhook_secret          TEXT,                            -- valida a URL do webhook
  updated_by              UUID,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- RLS: apenas super-admin da plataforma lê/escreve; usuários de tenant: default-deny.
```

### 2.2 `whatsapp_instances` — conexões (1 row por número)

```sql
CREATE TABLE whatsapp_instances (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  type                     TEXT NOT NULL CHECK (type IN ('personal','global')),
  user_id                  UUID REFERENCES users(id) ON DELETE CASCADE,   -- só personal
  instance_name            TEXT NOT NULL UNIQUE,           -- ex.: f360_<tenant>_<user>
  display_name             TEXT,                           -- rótulo p/ multi-plantão
  instance_token_encrypted TEXT,                           -- token por instância, criptografado
  status                   TEXT NOT NULL DEFAULT 'disconnected'
                           CHECK (status IN ('disconnected','connecting','qr_pending','connected','error')),
  phone_number             TEXT,
  -- anti-bloqueio / aquecimento:
  warmup_stage             TEXT NOT NULL DEFAULT 'new',
  warmup_day               INT  NOT NULL DEFAULT 1,
  hourly_limit             INT  NOT NULL DEFAULT 30,
  daily_limit              INT  NOT NULL DEFAULT 150,
  hourly_sent_count        INT  NOT NULL DEFAULT 0,
  daily_sent_count         INT  NOT NULL DEFAULT 0,
  counters_reset_at        TIMESTAMPTZ,
  working_hours_start      TIME NOT NULL DEFAULT '09:00',
  working_hours_end        TIME NOT NULL DEFAULT '21:00',
  is_paused                BOOLEAN NOT NULL DEFAULT false,
  pause_reason             TEXT,
  connected_at             TIMESTAMPTZ,
  last_seen_at             TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT wa_instance_personal_has_user
    CHECK ((type = 'personal' AND user_id IS NOT NULL) OR (type = 'global' AND user_id IS NULL))
);

CREATE UNIQUE INDEX wa_instances_one_personal_per_user
  ON whatsapp_instances (tenant_id, user_id) WHERE type = 'personal';
CREATE INDEX wa_instances_tenant_type_idx ON whatsapp_instances (tenant_id, type);
-- Originalmente havia UNIQUE (tenant_id) WHERE type='global' (1 plantão por tenant);
-- removido depois para permitir N plantões (multi-conexão).
```

### 2.3 `conversations` — 1 row por (instância × telefone)

```sql
CREATE TABLE conversations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel                 TEXT NOT NULL DEFAULT 'whatsapp'
                          CHECK (channel IN ('whatsapp','instagram','facebook','whatsapp_group')),
  instance_id             UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  lead_id                 UUID REFERENCES leads(id) ON DELETE SET NULL,
  assigned_user_id        UUID REFERENCES users(id) ON DELETE SET NULL,  -- atribuição DINÂMICA (plantão)
  owner_user_id           UUID REFERENCES users(id) ON DELETE SET NULL,  -- dono IMUTÁVEL (pessoal/grupo)
  contact_phone           TEXT,            -- JID bruto: 5551999@s.whatsapp.net | 1203...@g.us
  contact_handle          TEXT,            -- handle p/ canais futuros
  phone_normalized        TEXT,            -- só dígitos — chave de dedup
  display_name            TEXT,            -- SEMPRE o nome do contato (nunca do corretor)
  avatar_path             TEXT,            -- cache da foto no Storage
  status                  TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  unread_count            INT  NOT NULL DEFAULT 0,
  last_message_at         TIMESTAMPTZ,
  last_message_preview    TEXT,
  last_message_direction  TEXT,
  is_archived             BOOLEAN NOT NULL DEFAULT false,
  source                  TEXT,            -- 'personal' | 'global' (denormalizado de instance.type)
  -- distribuição (plantão/roleta):
  roleta_id               UUID,
  status_distribuicao     TEXT CHECK (status_distribuicao IN
    ('atribuicao_inicial','reatribuido_timeout','em_disputa',
     'atendimento_iniciado','em_espera','transferida_pessoal')),
  reserva_expira_em       TIMESTAMPTZ,
  attendance_started      BOOLEAN NOT NULL DEFAULT false,
  -- atribuição ao CRM (privacidade):
  lead_attributed_at      TIMESTAMPTZ,     -- marco "enviada para o CRM"
  lead_attributed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  historico_compartilhado BOOLEAN NOT NULL DEFAULT false,  -- transferência c/ histórico
  -- grupos:
  group_participants            JSONB,     -- [{jid, lid, phone, displayName, isAdmin}]
  group_participants_synced_at  TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX conversations_inst_phone_uk ON conversations (tenant_id, instance_id, phone_normalized);
CREATE INDEX conversations_tenant_last_idx     ON conversations (tenant_id, last_message_at DESC);
CREATE INDEX conversations_tenant_assigned_idx ON conversations (tenant_id, assigned_user_id);
CREATE INDEX conversations_lead_idx            ON conversations (lead_id);
CREATE INDEX conversations_owner_idx           ON conversations (tenant_id, owner_user_id) WHERE source = 'personal';
```

### 2.4 `messages` — histórico

```sql
CREATE TABLE messages (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id         UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  direction               TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  content                 TEXT,
  message_type            TEXT NOT NULL DEFAULT 'text' CHECK (message_type IN
    ('text','image','audio','video','document','system','sticker','contact','ptt')),
  status                  TEXT NOT NULL DEFAULT 'sent' CHECK (status IN
    ('queued','sending','sent','delivered','read','failed')),
  provider_message_id     TEXT,             -- id da UAZAPI (dedup inbound + quote/react/edit/delete)
  client_message_id       TEXT,             -- UUID v4 do cliente (idempotência outbound)
  sender_name             TEXT,             -- inbound: pushName do contato/participante
  sent_by                 TEXT NOT NULL DEFAULT 'human' CHECK (sent_by IN ('human','system')),
  sent_by_user_id         UUID REFERENCES users(id) ON DELETE SET NULL,  -- autoria outbound
  reply_to_provider_id    TEXT,             -- quote/reply
  media_path              TEXT,             -- path no Storage
  media_mime              TEXT,
  thumbnail_path          TEXT,
  transcription           TEXT,             -- transcrição de áudio (Whisper)
  transcription_status    TEXT CHECK (transcription_status IN ('pending','done','failed','unsupported')),
  deleted_at              TIMESTAMPTZ,      -- soft delete ("apagar para todos")
  error_message           TEXT,
  metadata                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX messages_conv_created_idx ON messages (conversation_id, created_at);
CREATE INDEX messages_tenant_idx       ON messages (tenant_id);
-- Dedup INBOUND (webhook reentrega):
CREATE UNIQUE INDEX messages_provider_dedup_uk ON messages (tenant_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;
-- Dedup OUTBOUND (double-submit do cliente):
CREATE UNIQUE INDEX messages_client_dedup_uk ON messages (tenant_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
```

**Conteúdo do `metadata` JSONB** (extensível, evita migrations por feature):

| chave | conteúdo |
|---|---|
| `reactions` | 1:1 → `{ me: "👍"\|null, contact: "❤️"\|null }`; grupo → `{ participants: { "<senderKey>": { nome, emoji } } }` |
| `starred` | `{ "<userId>": true }` — favoritas são por usuário |
| `sender_jid` | dígitos do participante (só grupos) |
| `quoted_type` / `quoted_text` | snapshot da mensagem citada vindo do webhook (fallback quando alvo não está no banco) |
| `fileName` | nome original do documento |
| `edited` | `true` após edição |
| `via` | `'whatsapp_app'` quando enviada do celular (fora do CRM) |

### 2.5 Trigger `on_new_message` — preview/unread automáticos

```sql
CREATE OR REPLACE FUNCTION public.on_new_message()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE conversations SET
    last_message_at = NEW.created_at,
    last_message_preview = LEFT(
      CASE
        WHEN conversations.channel = 'whatsapp_group'
         AND NEW.direction = 'inbound'
         AND COALESCE(NEW.sender_name, '') <> ''
        THEN NEW.sender_name || ': ' || COALESCE(NEW.content, INITCAP(NEW.message_type))
        ELSE COALESCE(NEW.content, INITCAP(NEW.message_type))
      END, 120),
    last_message_direction = NEW.direction,
    unread_count = CASE WHEN NEW.direction = 'inbound' THEN unread_count + 1 ELSE unread_count END,
    updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END; $$;

CREATE TRIGGER messages_after_insert AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION public.on_new_message();
```

> O trigger evita UPDATE duplo pelo app e garante que o Realtime de `conversations` também dispare a cada mensagem (lista reordena sozinha).

### 2.6 Tabelas satélites

```sql
-- Opt-out (blacklist de envio)
CREATE TABLE whatsapp_optouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  phone_normalized TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone_normalized)
);

-- Respostas rápidas (templates; user_id NULL = da empresa)
CREATE TABLE respostas_rapidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  atalho TEXT,
  conteudo TEXT,                -- opcional se houver mídia
  ativo BOOLEAN NOT NULL DEFAULT true,
  ordem INT NOT NULL DEFAULT 0,
  media_path TEXT, media_mime TEXT, media_filename TEXT,
  media_type TEXT CHECK (media_type IN ('image','video','audio','ptt','document')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT respostas_rapidas_conteudo_ou_midia CHECK (conteudo IS NOT NULL OR media_path IS NOT NULL)
);

-- Mensagens agendadas (processadas por cron)
CREATE TABLE mensagens_agendadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  texto TEXT,
  media_path TEXT, media_mime TEXT, media_filename TEXT,
  media_type TEXT CHECK (media_type IN ('image','video','audio','ptt','document')),
  resposta_rapida_id UUID REFERENCES respostas_rapidas(id) ON DELETE SET NULL,
  enviar_em TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pendente'
    CHECK (status IN ('pendente','enviando','enviada','cancelada','falhou')),
  erro TEXT,
  enviada_em TIMESTAMPTZ,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- conteúdo só é exigido enquanto pendente/enviando (FK SET NULL não pode quebrar histórico):
  CONSTRAINT mensagens_agendadas_conteudo CHECK (
    status NOT IN ('pendente','enviando')
    OR texto IS NOT NULL OR media_path IS NOT NULL OR resposta_rapida_id IS NOT NULL
  )
);
CREATE INDEX mensagens_agendadas_due_idx ON mensagens_agendadas (status, enviar_em);

-- Lembretes "responder depois" (por usuário)
CREATE TABLE atendimento_lembretes (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id, conversation_id)
);

-- Figurinhas salvas (galeria pessoal)
-- whatsapp_stickers_salvos: id, tenant_id, user_id, storage_path,
--   source_message_id (UNIQUE c/ tenant+user → dedup do "salvar do chat")

-- Grants de acesso ao plantão (por cargo OU usuário, nível ver/responder)
CREATE TABLE plantao_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  instance_id UUID NOT NULL REFERENCES whatsapp_instances(id) ON DELETE CASCADE,
  cargo_id UUID REFERENCES cargos(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  nivel TEXT NOT NULL CHECK (nivel IN ('ver','responder')),
  created_by UUID, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT plantao_acesso_um_principal CHECK (
    (cargo_id IS NOT NULL AND user_id IS NULL) OR (cargo_id IS NULL AND user_id IS NOT NULL))
);

-- Defaults do tenant para transferências
CREATE TABLE atendimento_config (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  compartilhar_historico_padrao BOOLEAN NOT NULL DEFAULT true,
  permitir_mover_para_pessoal BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Trilha de transferências (auditável)
CREATE TABLE atendimento_transferencias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  conversa_destino_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  de_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  para_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  canal_destino TEXT NOT NULL CHECK (canal_destino IN ('plantao','pessoal')),
  compartilhar_historico BOOLEAN NOT NULL DEFAULT false,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 2.7 Realtime e Storage

```sql
-- Habilita eventos ao vivo (Supabase Realtime / Postgres logical replication):
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- Bucket PRIVADO de mídia:
INSERT INTO storage.buckets (id, name, public)
VALUES ('atendimento-media', 'atendimento-media', false)
ON CONFLICT (id) DO NOTHING;
```

**Paths no bucket `atendimento-media`** (organização por prefixo, limpeza por tenant fácil):

| Uso | Path |
|---|---|
| Mídia de conversa | `{tenantId}/{conversationId}/{messageId}.{ext}` |
| Avatar do contato | `avatars/{tenantId}/{conversationId}.jpg` |
| Figurinha salva | `stickers/{tenantId}/{userId}/{stickerId}.webp` |
| Mídia de resposta rápida | `respostas/{tenantId}/{respostaId}.{ext}` |
| Mídia de agendada | `agendadas/{tenantId}/{agendadaId}.{ext}` |

Acesso ao bucket sempre via **signed URL** gerada server-side (TTL ~1h).

---

## 3. Integração UAZAPI — client e endpoints

### 3.1 Autenticação e config

- **2 tokens**: `admintoken` (header; só p/ criar instâncias e operações de plataforma) e `token` (header; por instância, usado em envio/status/webhook).
- Config global mora em `platform_integrations` (provider `'uazapi'`) com fallback em env (`UAZAPI_API_URL`, `UAZAPI_ADMIN_TOKEN`, `UAZAPI_WEBHOOK_SECRET`).
- Tokens criptografados em repouso com **AES-256-GCM** (chave em env). UI de admin só exibe `tokenLast4`. Audit nunca loga token plaintext.
- **Sem retry e sem timeout custom**: 1 tentativa por chamada; erro vira `IntegrationError` (5xx do provider → 502). Falha de envio vira `status='failed'` na mensagem — o usuário reenvia manualmente.

### 3.2 Tabela de endpoints usados

| Endpoint | Método | Token | Uso |
|---|---|---|---|
| `/instance/init` | POST | admin | criar instância |
| `/instance/connect` | POST | instância | obter QR code / pairing code |
| `/instance/status` | GET | instância | status + número conectado |
| `/instance/disconnect` | POST | instância | desconectar |
| `/webhook` | POST | instância | registrar URL do webhook |
| `/send/text` | POST | instância | texto (+ reply + menções) |
| `/send/media` | POST | instância | imagem/vídeo/áudio/ptt/documento/sticker |
| `/message/download` | POST | instância | baixar mídia recebida |
| `/message/delete` | POST | instância | revogar ("apagar p/ todos") |
| `/message/react` | POST | instância | reagir com emoji |
| `/message/edit` | POST | instância | editar texto |
| `/chat/read` | POST | instância | marcar conversa lida (sincroniza celular) |
| `/group/info` | POST | instância | nome + participantes do grupo |

### 3.3 Payloads de envio (exatos)

**Texto** — `POST /send/text`:
```json
{
  "number": "5551999999999",
  "text": "Olá! Como posso ajudar?",
  "replyid": "PROVIDER_ID_DA_MSG_CITADA",
  "mentions": "5511111111111,5512222222222"
}
```
- `replyid` e `mentions` são opcionais. `mentions` é CSV de números (grupos).
- Para **grupo**, `number` é o JID íntegro (`120363...@g.us`); para 1:1, só dígitos.

**Mídia** — `POST /send/media`:
```json
{
  "number": "5551999999999",
  "type": "image",
  "file": "<base64 OU URL pública>",
  "text": "Legenda da foto",
  "mimetype": "image/jpeg",
  "docName": "contrato.pdf",
  "replyid": "...",
  "mentions": "..."
}
```
- `type`: `image | video | audio | ptt | document | sticker`. **`ptt`** renderiza como nota de voz no WhatsApp; `audio` como arquivo.
- ⚠️ A legenda vai no campo **`text`**, não `caption`. `docName` só para documentos.
- Áudio gravado: `mimetype: "audio/ogg"` (opus). Sticker: `image/webp`.

**Reação** — `POST /message/react`:
```json
{ "number": "5551999999999", "text": "👍", "id": "PROVIDER_ID_ALVO" }
```
- `text: ""` (vazio) **remove** a reação (toggle).

**Apagar** — `POST /message/delete`: `{ "id": "PROVIDER_ID" }` (revoke nativo; depois chega webhook `messages_update` com status `Deleted`).

**Editar** — `POST /message/edit`: `{ "id": "PROVIDER_ID", "text": "novo texto" }`.
⚠️ **Retorna um NOVO message id** — é obrigatório atualizar `messages.provider_message_id`, senão reply/react/delete subsequentes quebram.

**Marcar lida** — `POST /chat/read`: `{ "number": "<JID>", "read": true }` — zera o badge também no celular do dono do número.

**Baixar mídia recebida** — `POST /message/download`:
```json
{ "id": "PROVIDER_ID", "return_base64": true, "return_link": false,
  "generate_mp3": true, "transcribe": false }
```
- ⚠️ O webhook da UAZAPI v2 **não traz o binário nem URL da mídia** — só o id. A mídia fica ~2 dias no provider; `/message/download` é a única forma de obtê-la. Por isso o download é disparado imediatamente (assíncrono) ao receber.

**Grupo** — `POST /group/info`: `{ "groupjid": "120363...@g.us", "force": false }` → `{ Name, Participants: [{ JID, LID, PhoneNumber, DisplayName, IsAdmin }] }`.

### 3.4 Resiliência a variações de schema do provider

O client normaliza respostas tentando **múltiplos caminhos** (a UAZAPI varia entre versões):
- token da instância: `instance.token` → `instance.apikey` → `token` → `key`
- QR: `instance.qrcode` → `qrcode` → `qrCode` → `base64` → `image`
- messageId de envio: `.id` → `.messageid` → `.key.id` → `.message.key.id`
- status: procura strings `open|connected|online` → `connected`; `connecting|syncing` → `connecting`; `qr` → `qr_pending`

Replique esse padrão de "extractor tolerante" — é o que evita quebrar a cada update do gateway.

---

## 4. Instâncias WhatsApp — ciclo de vida

### 4.1 Conectar (criar instância)

1. Gera `instance_name` determinístico: `f360_<tenant-curto>_<user-curto>` (pessoal) ou `..._global` (plantão).
2. (Plantão) valida limite de conexões do plano do tenant.
3. **Upsert** da row local com `status='qr_pending'` (idempotente por `instance_name`).
4. `POST /instance/init` com admintoken → recebe `{ name, token }` (o provider pode normalizar o nome — persistir o nome real).
5. Salva `instance_token_encrypted` (AES-256-GCM).
6. **Registra o webhook** (best-effort — não bloqueia a conexão se falhar):
```json
{
  "url": "https://app.exemplo.com/api/whatsapp/webhook/<webhook_secret>",
  "enabled": true,
  "events": ["messages", "connection", "messages_update", "chats"],
  "excludeMessages": ["wasSentByApi"]
}
```
   - `excludeMessages: ["wasSentByApi"]` evita receber eco das mensagens que o próprio CRM enviou (dedup primário; há race conditions, então a rota revalida).
7. Audit (`atendimento.instance_connected`).

### 4.2 Parear (QR / pairing code)

- `POST /instance/connect` (opcionalmente com `phone` p/ pairing code) → `{ qrcode, pairingCode }`.
- **Polling na UI**: a cada **5s** enquanto `qr_pending|connecting`; a cada **60s** quando `connected` (health check).
- Quando o webhook `connection` chega com `state: "open"`, atualiza `status='connected'` + `connected_at`.

### 4.3 Operações

- **Status**: `GET /instance/status` → normaliza → persiste `{status, phone_number, last_seen_at}`.
- **Desconectar**: `POST /instance/disconnect` (best-effort) → zera `status/phone_number/connected_at`.
- **Reconectar webhook**: re-registra a URL sem desconectar (essencial em dev com túnel; aqui propaga erro para feedback visual).

---

## 5. Recebimento de mensagens (webhook)

### 5.1 Rota: `POST /api/whatsapp/webhook/[secret]`

**Autenticação**: comparação direta do `<secret>` do path com `platform_integrations.webhook_secret`. Falhou → 401. **Um único webhook para a plataforma inteira** — o roteamento multi-tenant é feito pelo `instanceName` do payload.

**Regra de ouro**: a rota **sempre retorna 200** (mesmo em erro interno, que só é logado) — UAZAPI não deve retentar.

### 5.2 Parser de eventos (normalização)

O parser transforma o payload bruto (que varia entre versões/Baileys) em uma union discriminada:

```typescript
type UazapiEvent =
  | { kind: "message"; instanceName; direction: "inbound"|"outbound";
      messageType: "text"|"image"|"audio"|"video"|"document"|"sticker"|"contact";
      content: string; phone: string /* JID com sufixo */;
      providerMessageId: string; senderName: string|null;
      senderJid: string|null /* só grupo */; contactName: string|null;
      mediaUrl: string|null; mime: string|null; wasSentByApi: boolean;
      replyToProviderId: string|null;
      quotedSnapshot: { type, text }|null; avatarUrl: string|null; isGroup: boolean }
  | { kind: "connection"; instanceName; state: "open"|"connecting"|"close" }
  | { kind: "status"; providerMessageId; status: "sent"|"delivered"|"read"|"failed"|"deleted" }
  | { kind: "chat_unread"; instanceName; phone; unreadCount: number }
  | { kind: "reaction"; instanceName; direction; targetProviderId; emoji: string /* "" = remoção */;
      isGroup: boolean; senderName: string|null; senderKey: string }
  | { kind: "ignore" };
```

**Normalizações críticas do parser**:

1. **`contactName` vem SEMPRE do objeto `chat`** (`chat.wa_name` → `chat.wa_contactName` → `chat.name`), **nunca** de `senderName` quando `fromMe=true` — senão o nome do corretor sobrescreve o nome do contato.
2. **Status em Title Case**: a UAZAPI v2 emite `"Read"`, `"Delivered"`, `"Sent"` — normalizar case-insensitive com mapa:
   `PENDING/SERVER_ACK/SENT→sent · DELIVERY_ACK/DELIVERED→delivered · READ/PLAYED→read · ERROR/FAILED/CANCELED→failed · DELETED→deleted`.
3. **Reação** chega como `messages` com `messageType: "ReactionMessage"`; o alvo está em `content.reactionMessage.key.id` e o emoji em `content.reactionMessage.text` (vazio = remoção). `senderKey` = dígitos do JID do reator (fallback: senderName).
4. **Quoted/reply**: extrai `contextInfo.stanzaID` (id da citada) + snapshot `{type, text}` da `quotedMessage` para fallback de preview.
5. **Grupo**: `chatid` termina em `@g.us`; `senderJid` = dígitos do participante.

### 5.3 Pipeline do evento `message` (passo a passo)

```
1. SKIP se direction=outbound && wasSentByApi  (eco da própria API — dedup primário)
2. SKIP se !providerMessageId                  (sem id não há dedup)
3. Resolve instância por instanceName → { tenantId, instanceId, type, ownerUserId }
   (não achou → 200 silencioso, sem vazar existência)
4. SKIP se isGroup && type !== 'personal'      (grupos só em instância pessoal)
5. upsertConversation({
     tenantId, instanceId,
     channel: isGroup ? 'whatsapp_group' : 'whatsapp',
     phone (JID bruto → contact_phone),
     phoneNormalized (só dígitos → chave do upsert),
     displayName: contactName,               // nunca o nome do corretor
     source: instanceType, ownerUserId })
   → pre-check SELECT por provider_message_id (dedup) + UNIQUE index como rede final
6. INSERT message:
   - fromMe → appendOutboundFromPhone (sent_by_user_id = dono da instância, metadata.via='whatsapp_app')
   - inbound → appendInboundMessage (sender_name, metadata.sender_jid se grupo)
   → trigger on_new_message atualiza preview/unread → Realtime notifica clients
7. after() — assíncrono, não bloqueia o 200:
   a. SE mídia → processInboundMedia: POST /message/download → bytes →
      upload Storage ({tenant}/{conv}/{msg}.{ext}) → UPDATE messages.media_path/mime
   b. SE avatarUrl → cacheConversationAvatar (download-once)
   c. SE inbound && !grupo → detectOptout(content) → INSERT whatsapp_optouts
   d. SE inbound && !grupo → dispatchMensagemRecebida (automações)
   e. SE inbound && !grupo && instância global → roleta: reabrirSeTransferida + distribuir
8. return 200 { ok: true }
```

### 5.4 Demais eventos

- **`connection`**: mapeia `open→connected · connecting→connecting · close→disconnected` e atualiza `whatsapp_instances` (status, `last_seen_at`, `connected_at`).
- **`status`** (`messages_update`): localiza a mensagem por `provider_message_id`.
  - `deleted` → soft-delete (`deleted_at = now()`; refresh do preview da conversa se era a última).
  - Demais → `updateMessageStatus` com **rank forward-only**: `queued < sending < sent < delivered < read`; regressões são ignoradas; `failed` é terminal. (Sem isso, eventos fora de ordem fazem o tick "voltar".)
- **`chat_unread`** (`chats`): só interessa `unreadCount === 0` (dono leu no celular) → zera `conversations.unread_count`. Valores > 0 são ignorados (o CRM mantém contador próprio via trigger).
- **`reaction`**:
  - 1:1 ou outbound → slot simples: `metadata.reactions = { me|contact: emoji|null }`.
  - Grupo inbound → mapa por participante: `metadata.reactions.participants[senderKey] = { nome, emoji }`; emoji vazio deleta a entrada; sem `senderKey` → descarta (melhor não atribuir do que atribuir errado).
  - Match do alvo: igualdade exata de `provider_message_id`, com fallback por sufixo (`LIKE '%:id'`).

---

## 6. Envio de mensagens — pipeline do servidor

### 6.1 `enviarMensagem()` — fluxo em 9 etapas

```
entrada: { tenantId, viewerUserId, conversationId, texto?, arquivo?,
           clientMessageId?, replyToProviderId?, mentions?, sentBy: 'human'|'system',
           throttleProfile: 'interactive'|'automated'|'scheduled' }

1. GUARD cross-tenant: conversa pertence ao tenant (assertInTenant)
2. LOAD conversa + 4 queries paralelas (Promise.all):
     a) instância (status, paused, contadores, horário, token criptografado)
     b) opt-out do telefone (pula se grupo)
     c) existe inbound do contato? (p/ cooldown)
     d) mensagem existente com este clientMessageId (idempotência)
   BLOQUEIA se status_distribuicao = 'transferida_pessoal' (conversa encerrada p/ envio)
3. IDEMPOTÊNCIA: se clientMessageId já existe
     - status != 'failed' → retorna a row vencedora (double-submit = no-op)
     - status == 'failed' → reusa a row (reenvio sem duplicar)
4. OPT-OUT: telefone na blacklist → erro 'optout'
5. THROTTLE (checkSendAllowed):
     - instância desconectada/pausada → erro
     - perfil 'interactive' (humano respondendo): ISENTO de horário e limites
     - perfil 'automated' (sistema): horário comercial + limites hora/dia valem
     - perfil 'scheduled': isento de horário, limites valem
     - cooldown 24h pós-conexão se nunca houve inbound do contato (anti-ban;
       grupos isentos)
6. DECRYPT token + resolve destino:
     grupo → contact_phone íntegro (JID @g.us); 1:1 → phone_normalized
7. INSERT messages com status='queued'
     (direction='outbound', client_message_id, sent_by, sent_by_user_id,
      reply_to_provider_id, metadata.fileName)
     race no UNIQUE (23505) → re-SELECT e retorna a row vencedora
8. CHAMA UAZAPI: sendMedia(...) se arquivo, senão sendText(...)
     falha → UPDATE status='failed' + error_message → return { ok:false, error }
9. SUCESSO: UPDATE status='sent' + provider_message_id
     after() best-effort (não bloqueia a resposta):
       - upload da mídia p/ Storage (a UAZAPI já recebeu o base64; o Storage é p/ histórico)
       - incrementa contadores hourly/daily da instância
       - limpa lembrete "responder depois" do autor
     return { ok:true, messageId }
```

**Por que grava-primeiro (`queued`) e não dispara-primeiro?** Disparar antes de gravar perde rastreio de delivered/read (o webhook `messages_update` precisa achar a row por `provider_message_id`), perde dedup e perde histórico em caso de crash. A fluidez não vem daqui — vem do cliente (§7).

### 6.2 Idempotência (contrato com o cliente)

- O cliente gera `clientMessageId = crypto.randomUUID()` por mensagem.
- O servidor **valida regex de UUID v4** (qualquer outra string é descartada — o valor entra em índice).
- Proteção em 3 camadas: pre-check SELECT → UNIQUE `(tenant_id, client_message_id)` → handler de 23505 que re-SELECTa e responde ok.
- Retry do cliente reusa o mesmo UUID → nunca duplica.

### 6.3 Apagar e editar

**Apagar para todos** (`apagarMensagem`): só outbound, só com `provider_message_id`, idempotente. `POST /message/delete` → soft-delete local (`deleted_at`) → refresh do preview → audit. UI mostra "Mensagem apagada".

**Editar** (`editarMensagem`): só texto, só outbound, janela de **15 min** (`EDIT_WINDOW_MS = 15*60_000`), não deletada. `POST /message/edit` → **persistir o NOVO provider_message_id** + `content` + `metadata.edited=true` → refresh preview → audit.

---

## 7. Fluidez do envio — fila otimista no cliente ⭐

> Esta é a peça central da UX. Resultado: a mensagem aparece **instantaneamente** na thread (status "enviando"), o campo limpa na hora, nada trava — e a consistência é reconciliada em background.

### 7.1 Arquitetura da fila

**Store em nível de módulo** (fora do React — sobrevive à troca de conversa, morre no reload, igual WhatsApp Web):

```typescript
const queues   = new Map<string, FilaItem[]>();  // conversationId → fila
const listeners = new Set<() => void>();          // subscribers (useSyncExternalStore)
const running  = new Set<string>();               // conversas com worker ativo
let refreshCallback: (() => void) | null = null;  // fallback qdo realtime atrasa
```

**Item da fila**:

```typescript
interface FilaItem {
  clientMessageId: string;     // UUID v4 — chave de reconciliação ponta a ponta
  conversationId: string;
  kind: "mensagem" | "sticker" | "resposta_rapida";
  payload: {                   // tudo que a action precisa p/ (re)enviar
    texto?: string;
    arquivo?: { dataBase64, mime, fileName, type };
    replyToProviderId?: string | null;
    stickerId?: string; respostaId?: string;
    mentions?: string[];
  };
  optimistic: MessageItem;     // a bolha pré-montada (id: `optimistic-${uuid}`)
  status: "pending" | "sending" | "sent" | "failed";
  error: string | null;        // código do servidor (traduzido por friendlyError)
  attempts: number;
  enqueuedAt: string;
}
```

O componente lê a fila com `useSyncExternalStore` → re-render automático a cada mutação.

### 7.2 Enfileirar (caminho do Enter)

`handleSend()` no composer é **síncrono** (zero await no caminho crítico):

1. Gera `clientMessageId = crypto.randomUUID()`.
2. Monta `optimistic: MessageItem` completo: `status: "sending"`, `createdAt: now`, e — para mídia — `signedUrl = URL.createObjectURL(blob)` (preview local imediato).
3. `enqueueSend(item)` → push na fila + `runWorker(conversationId)`.
4. `setText("")` — o campo limpa **na hora**; a UI nunca espera rede.

Para múltiplos anexos: cada arquivo vira um item separado da fila; legenda e reply vão **só no primeiro**; imagens consecutivas sem legenda viram álbum na renderização (§8.3).

### 7.3 Worker (sequencial por conversa, paralelo entre conversas)

```typescript
async function runWorker(conversationId: string) {
  if (running.has(conversationId)) return;     // guard de reentrância
  running.add(conversationId);
  try {
    for (;;) {
      const item = nextPending(queues.get(conversationId));  // 1º 'pending'
      if (!item) break;
      marcarStatus(item, "sending");
      let result;
      try { result = await dispatch(item); }   // server action (enviar / sticker / resposta)
      catch { result = { ok: false, error: "unexpected" }; } // nunca propaga
      marcarStatus(item, result.ok ? "sent" : "failed", result.error);
      refreshCallback?.();                     // router.refresh como fallback do realtime
    }
  } finally { running.delete(conversationId); }
}
```

Regras:
- **Sequencial por conversa** → preserva ordem cronológica (como WhatsApp).
- **Paralelo entre conversas** → um worker por conversationId.
- **`failed` não trava a fila**: `nextPending` pula itens falhados; eles ficam na thread com botões Reenviar/Descartar.
- Exceções viram `{ok:false, error:"unexpected"}` ("Sem conexão — tente reenviar").

### 7.4 Merge com o servidor (a thread que o usuário vê)

```typescript
const allMessages = useMemo(
  () => mergeComServidor(windowMessages /* prop do servidor */, filaItems),
  [windowMessages, filaItems]);
```

`mergeComServidor`:
- Janela do servidor em ordem `created_at` + bolhas locais não confirmadas no fim.
- **Dedup por `clientMessageId`: a row do servidor SEMPRE vence.**
- **Herança de preview**: se a row do servidor é mídia mas ainda **sem** signed URL (upload p/ Storage é best-effort pós-envio), a bolha herda o objectURL local — sem "flash" de preview sumindo.
- Mapeamento de status local: `pending|sending → 'sending'` (tick ⏰), `sent → 'sent'` (✓), `failed → 'failed'` (✗ + ações).

### 7.5 Pruning (limpeza) e gestão de blob URLs

Effect observando a prop `messages`: quando a row do servidor com o mesmo `clientMessageId` chega:
- **Texto**: remove da fila imediatamente.
- **Mídia**: só remove quando a row já tem `signedUrl` (Storage concluído) — até lá a bolha local segura o preview.
- Ao remover, **`URL.revokeObjectURL`** em todos os previews `blob:` (evita memory leak).
- Nunca remove `failed` (o payload é necessário para Reenviar) nem `pending`.

### 7.6 Retry / Discard

- **Reenviar**: status volta a `pending`, `attempts++`, worker reativa. Mesmo `clientMessageId` → o servidor reusa a row `failed` (UPDATE p/ `queued`), zero duplicação.
- **Descartar**: remove da fila + revoga blob + chama action que **hard-deleta** a row `failed` do banco (por `client_message_id`).
- Erros traduzidos por dicionário (`send-errors.ts`): `instance_not_connected` → "Instância WhatsApp desconectada", `outside_working_hours`, `daily_limit`, `optout`, `unexpected` → "Sem conexão — tente reenviar", etc.

### 7.7 Decisões de latência que fazem diferença

1. **Sem `revalidatePath` na action de envio** — a página é `force-dynamic` e atualiza via realtime + `router.refresh()` do worker; revalidar a cada mensagem só somava latência na resposta que o worker espera.
2. **Side effects pós-envio via `after()`** — a action responde assim que o provider confirma; upload de Storage e contadores acontecem depois.
3. **Queries de validação em `Promise.all`** — instância, opt-out, inbound-check e idempotência em paralelo.
4. **Realtime + refreshCallback dupla via de atualização** — se o realtime estiver lento/caído, o próprio worker força refresh ao concluir cada item.

---

## 8. Layout e estrutura da UI

### 8.1 Página (Server Component, `force-dynamic`)

Layout **3 colunas** dentro de uma moldura única com borda arredondada:

```
┌───────────────┬──────────────────────────────┬─────────────────┐
│ COLUNA 1      │ COLUNA 2                     │ COLUNA 3 (xl+)  │
│ ~320px aside  │ flex-1 main                  │ colapsável      │
│               │                              │                 │
│ Conversation  │ ThreadHeader                 │ LeadContext     │
│ List          │ [faixa contexto do lead]     │ Panel           │
│  - tabs       │ ThreadSearch (toggle)        │  - resumo lead  │
│  - busca      │ ┌──────────────────────────┐ │  - tags/status  │
│  - chips      │ │ scroller de mensagens    │ │  - ações        │
│  - cards      │ │  (infinite scroll ↑)     │ │  - nota rápida  │
│  - plantão    │ └──────────────────────────┘ │                 │
│    check-in   │ PlantaoActionBar / banners   │                 │
│               │ Composer                     │                 │
└───────────────┴──────────────────────────────┴─────────────────┘
```

- **Mobile**: 1 coluna por vez (lista OU thread, alternadas pela seleção `?c=<id>` na URL).
- **Server fornece**: lista de conversas (já filtrada por RBAC), janela de mensagens da selecionada, resumo do lead, agendadas, lembretes, roletas. **Client cuida**: filtros, busca, fila de envio, realtime.
- **`key={conversationId}` no ConversationThread**: troca de conversa **remonta** o componente — zera estado local (janela de mensagens, gravador, reply) de propósito.
- Providers: contexto do painel do lead (toggle persistido em localStorage via `useSyncExternalStore`), provider do lightbox de mídia.

### 8.2 Lista de conversas

- A prop é **sempre a lista completa**; abas (Tudo / Plantão / Pessoal / Grupos) e chips de triagem (Não lidas / Meus contatos / Lead no CRM) filtram **100% client-side** (useMemo) — troca de filtro é instantânea, sem refetch. O filtro ativo sincroniza com a URL via `history.replaceState` (sem navigation).
- **Card** (2 linhas + 1 condicional):
  - Linha 1: avatar (foto cacheada ou inicial colorida com `color-mix` da cor primária) + nome + hora relativa + ícones (🔒 privada, 📅 tem agendada, 🔔 silenciada).
  - Linha 2: preview da última mensagem com emoji de tipo (🎙️ 📷 🎬 📄) + pill de não-lidas (`99+` cap).
  - Linha 3 (condicional): chips — origem, countdown de reserva do plantão (MM:SS, atualizado a cada 1s), "Responder depois" com dot pulsante.
- **Identidade visual por origem** (borda esquerda + bg de seleção): Plantão = violeta, Pessoal privada = esmeralda, Lead no CRM = dourado/primária, Grupo = azul.
- Contadores por aba calculados sobre o conjunto completo; sub-abas do Plantão ("Novos" vs "Meus") classificam por `status_distribuicao` + `assignedUserId`.
- Busca normalizada (lowercase + NFD sem acentos) sobre nome, lead, telefone e preview.
- **Relógio compartilhado**: um único `setInterval` de 60s atualiza `now` para todos os cards (hora relativa, badge de "espera longa" 30min+) — não um timer por card.
- Atualização em tempo real: o realtime global chama `router.refresh()`; como o trigger do banco atualiza `last_message_*`, a lista reordena sozinha.

### 8.3 Thread de mensagens

**Janela + infinite scroll** (hook `useMessageWindow`):
- Servidor entrega as últimas **60** mensagens (`ORDER BY created_at DESC LIMIT 61` → `hasMore` pelo +1 → reverte p/ ordem cronológica).
- Estado do hook: `tail` (prop do servidor) + `older` (páginas antigas carregadas no cliente) + `seen` (Map id→msg, cache da sessão — nada some quando o tail desliza).
- **Sentinel no topo** + IntersectionObserver com `rootMargin: 200px` → dispara `carregarMensagensAnterioresAction(before: <createdAt da mais antiga>)` antes de o usuário bater no topo.
- **Âncora de scroll**: `useLayoutEffect` guarda `scrollHeight` antes do prepend e compensa o delta — a viewport não pula.

**Agrupamento e renderização** (pipeline puro antes do render):
1. Agrupa por dia → `DateSeparator` sticky no topo do scroller (chip com a data).
2. Separa **eventos de sistema** (transferências, reaberturas) das mensagens — viram chips centralizados, nunca entram em álbuns.
3. **Runs de álbum**: 2+ imagens/vídeos consecutivos do mesmo remetente, sem legenda e sem reply → grid 2×2 (4 visíveis, `+N` overlay), clique abre o lightbox no índice certo.
4. **Continuação**: mesma direção + mesmo autor + ≤5 min → oculta o rótulo do autor e reduz a margem (visual de "sequência").

**Bolha de mensagem**:
- Rótulo de autoria viewer-aware: inbound → nome do contato; outbound do próprio viewer → **"Você"**; outbound de outro → nome real; legado (NULL) → sem rótulo.
- Texto renderizado por `LinkifiedText`: tokenizer de markdown do WhatsApp (`*b*`, `_i_`, `~s~`, `` `mono` ``, sem aninhamento; URLs não são formatadas por engano), URLs viram links (pontuação final excluída), menções `@<dígitos>` viram `@Nome` destacado (via mapa de participantes).
- **Ticks de status**: ⏰ queued/sending · ✓ sent · ✓✓ delivered · ✓✓ azul read · ✗ vermelho failed.
- Reply/quote: preview da citada acima do corpo; clique rola até o alvo + flash dourado de 1.9s.
- Reações: 1:1 mostra o emoji do contato/meu; grupo agrega por emoji (até 4 chips + "+N", tooltip com nomes).
- Ações no hover: Responder · Reagir (presets `👍 ❤️ 😂 😮 😢 🙏` + toggle) · Favoritar ⭐ · Editar (inline, textarea no lugar do texto) · Apagar (**confirmação em 2 cliques**: botão "arma" e auto-desarma em 4s).
- `deleted_at` → corpo vira "Mensagem apagada" em itálico.
- Mensagem `failed`: bloco com erro traduzido + botões **Reenviar** / **Descartar**.

**Mídia na bolha**:
- Imagem → thumbnail clicável → lightbox fullscreen (navegação ← → por teclado, contador, download via fetch→blob).
- Vídeo → `<video controls>` + maximizar.
- Áudio/PTT → player próprio: play/pause, slider, velocidade 1×→1.5×→2× (persistida em localStorage), duração (hack p/ WebM: seek a `1e101` força o browser a computar duration Infinity), botão **"Transcrever áudio"** (on-demand).
- Documento → chip com nome do arquivo + download. Sticker → imagem 128px + ação "salvar figurinha". Contato → card vCard.

**Header da thread**: avatar + nome + telefone formatado (`+55 51 9912-2653`, copiar copia só dígitos) + ações: busca na conversa (client-side sobre conteúdo+transcrição, navegação ↑/↓ com scroll+flash), favoritas (dropdown com as ⭐ do viewer, clique pula até a mensagem), galeria de mídia (dialog com abas Mídia/Documentos/Links, lazy por aba, paginação 30, grid 3 col), membros do grupo, silenciar (local), lembrete, atribuir lead, transferir.

**Banners contextuais**:
- `PlantaoActionBar`: "Pegar conversa" (disputa) / "Iniciar atendimento" + countdown de reserva.
- `AgendadasBanner`: agendadas pendentes do viewer (expand/collapse, cancelar individual).
- `TransferidaBanner`: substitui o composer quando `transferida_pessoal` — "atendimento segue por [nome]" + CTA "Ver atendimento atual".

---

## 9. Composer — todos os recursos

Estrutura: linha de pendências (reply ativo, anexos, áudio) → textarea → linha de botões.

| Recurso | Implementação |
|---|---|
| **Texto multilinha** | textarea `rows=2`, `max-h-32` com scroll interno; Enter envia, Shift+Enter quebra linha; placeholder contextual ("Adicione uma legenda…" com anexo) |
| **Formatação** | toolbar flutuante acima da seleção (aparece quando há texto selecionado); botões com `onMouseDown` + `preventDefault` (preserva a seleção); toggle envolve/remove `*` `_` `~` `` ` ``; atalhos Ctrl+B / Ctrl+I; `requestAnimationFrame` restaura foco+seleção |
| **Emoji** | emoji-picker-react via `dynamic import { ssr: false }`, tema dark, sprites Apple, lazy; insere na posição do caret |
| **Stickers** | galeria pessoal (upload `.webp` validado por magic bytes + máx 1MB) + "salvar do chat" (cópia física do storage, dedup por source_message_id); clique envia direto pela fila (kind `sticker`) |
| **Respostas rápidas** | popover com templates da empresa + pessoais, busca por título/atalho/conteúdo; template de texto **insere no campo** (editável), template com mídia **envia direto** (kind `resposta_rapida`) |
| **Anexos** | input `accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"`, máx 10 por envio; **Ctrl+V cola imagem** (handlePaste); chips com preview (objectURL) e X individual; cada arquivo = 1 item da fila; legenda/reply só no 1º |
| **Áudio (PTT)** | `opus-recorder` (import dinâmico) com worker em `/public/opus/encoderWorker.min.js`; config: **OGG/Opus, 16 kHz, mono, `encoderApplication: 2048` (VOIP)** — formato que o WhatsApp renderiza como nota de voz nativa; preview `<audio controls>` antes de enviar; envia como `type: "ptt"`, `mime: "audio/ogg"` |
| **Menções (grupos)** | regex `/(^|\s)@([\p{L}\p{N}]{0,30})$/u` detecta `@query` → popover ancorado acima (navegação ↑/↓, Enter/Tab); insere `@Nome` como token; no envio, tokens viram `@<número>` no texto + array `mentions[]`; popover usa `onMouseDown preventDefault` p/ não roubar o foco da textarea |
| **Agendamento** | dialog sob demanda; **fuso fixo America/Sao_Paulo** (datetime-local interpretado como SP e convertido a UTC no servidor — consistente independente do fuso do browser); agenda texto digitado, mídia ou resposta rápida; antecedência 1 min–30 dias; se o texto agendado == rascunho atual, limpa o campo |
| **Assinatura** | toggle persistido em localStorage (`useSyncExternalStore`, SSR-safe); quando ativo, prefixa `*Nome:*\n` (negrito WhatsApp) no texto |
| **Reply** | barra acima do campo com preview da citada + X para cancelar; enviado como `replyToProviderId` |

Estados que **bloqueiam** digitação: gravando áudio ou áudio pendente (o campo vira "Enviar áudio…"). Nada mais bloqueia — o envio nunca trava a UI.

---

## 10. Realtime

Client island invisível montado uma vez na página:

```typescript
// 1. CRÍTICO: autenticar o socket — sem isso o canal conecta como 'anon'
//    e as policies RLS filtram TODOS os eventos (zero updates, sem erro).
const { data } = await supabase.auth.getSession();
await supabase.realtime.setAuth(data.session.access_token);

// 2. Um canal, duas assinaturas postgres_changes filtradas por tenant:
channel
  .on("postgres_changes", { event: "*", schema: "public",
       table: "messages",      filter: `tenant_id=eq.${tenantId}` }, onMessage)
  .on("postgres_changes", { event: "*", schema: "public",
       table: "conversations", filter: `tenant_id=eq.${tenantId}` }, onConversation)
  .subscribe();
```

- **Qualquer evento → `router.refresh()`** — os Server Components re-renderizam com dados frescos (lista reordena, thread ganha a mensagem, ticks atualizam). Não há manipulação manual de cache no cliente: o servidor é a fonte de verdade, o realtime é só o gatilho.
- **Som de notificação** apenas quando: INSERT inbound + conversa não silenciada (localStorage, checagem síncrona) + `source === 'personal'` + não é grupo + a instância pertence ao viewer.
- Cleanup no unmount (`removeChannel`) + flag `cancelled` para operações em voo.
- **RLS vale para o realtime**: como as policies de SELECT restringem conversas pessoais/grupos, cada usuário só recebe eventos do que pode ver.

---

## 11. Recursos do produto

### 11.1 Reações
Presets `👍 ❤️ 😂 😮 😢 🙏`. Toggle: reagir com o mesmo emoji remove (envia `text: ""` ao provider). Persistência em `messages.metadata.reactions`. Recebimento via webhook (§5.4). Audit.

### 11.2 Mensagens agendadas
- Criação valida: antecedência [1 min, 30 dias], conteúdo = texto XOR mídia XOR resposta rápida.
- **Motor (cron ~2 min, 25 por tick)**:
  1. Sweep de crash: presas em `enviando` >10 min → `falhou`.
  2. `WHERE status='pendente' AND enviar_em <= now()` (índice `due_idx`).
  3. **Claim atômico** `pendente→enviando` (UPDATE condicional — evita duplo envio com 2 workers).
  4. **Revalida acesso na hora** (usuário ativo? conversa ainda acessível?).
  5. **Resolve conteúdo na hora** (resposta rápida pode ter mudado; mídia baixada do Storage → base64).
  6. `enviarMensagem(throttleProfile: 'scheduled')`. Limite horário/diário → **volta a `pendente` + adia 30 min** (transitório ≠ falha).
  7. Sucesso → `enviada` + `message_id`; falha → `falhou` + erro. Audit.

### 11.3 Lembretes ("responder depois")
Toggle por (user, conversa). Diferente de "marcar não-lida": **não some ao abrir a conversa** — persiste até o usuário responder (auto-clear best-effort no envio) ou desmarcar. Badge com dot pulsante no card.

### 11.4 Respostas rápidas
Templates empresa (`user_id NULL`, escritos por admin) + pessoais. Texto e/ou mídia (máx ~2.9MB). Atalho de busca (`/bomdia`). Exclusão de template marca agendadas pendentes que o usavam como `falhou` antes do DELETE (consequência do FK `SET NULL` + CHECK).

### 11.5 Transcrição de áudio
On-demand (botão no player). Marca `transcription_status='pending'` imediatamente (feedback), baixa do Storage, chama Whisper (API key por tenant), persiste `transcription` + status `done/failed/unsupported`. A transcrição entra no índice de busca da thread.

### 11.6 Grupos
- Só em instância **pessoal**; conversa `channel='whatsapp_group'`, **owner-only absoluto** (nem admin do tenant, nem platform admin enxergam — RLS com CASE específico).
- Participantes: cache JSONB na conversa, TTL 24h, sync sob demanda (`/group/info`), fallback no cache velho se o provider falhar.
- Mapa de nomes: prioridade `pushName` do histórico de mensagens > `displayName` do participante > telefone. Suporta JID e LID.
- Preview da lista mostra `"Participante: texto"` (trigger do banco).
- Reações por participante (mapa), menções @, dialog de membros com badge de admin.
- Grupos **não** disparam: som, opt-out, automações, roleta, cooldown de envio.

### 11.7 Plantão (número compartilhado) + roleta
- Conversas inbound da instância global são distribuídas por roleta (round-robin ou disputa), com horário de funcionamento, SLA/timeout de reserva (countdown no card), corretor preferencial e check-in/check-out (widget com `useOptimistic`).
- Estados: `atribuicao_inicial → em_disputa/atendimento_iniciado → em_espera → transferida_pessoal`.
- Grants de acesso por conexão: `ver` (read-only) / `responder` (opera), por cargo ou usuário; escopo "empresa" tem acesso automático.
- Cron (`roleta-tick`, ~1–2 min): expira reservas, abre/fecha por horário, processa agendadas.

### 11.8 Transferência de atendimento
- **Para plantão**: lead muda de responsável, conversa marca `atendimento_iniciado`, mensagem de sistema, trilha + audit.
- **Para WhatsApp pessoal**: exige instância pessoal conectada do destino; cria/acha a conversa pessoal (upsert idempotente); conversa do plantão vira `transferida_pessoal` (**composer bloqueado**, banner com CTA) e **zera `assigned_user_id`** (senão o corretor antigo manteria acesso por atribuição mesmo com histórico restrito); flag `historico_compartilhado` decide se o destino vê o histórico.
- **Reabertura**: cliente chama de novo no plantão → histórico compartilhado reabre atribuída ao corretor; restrito reabre **sem** atribuição (triagem decide).

### 11.9 Atribuir conversa pessoal a lead ("enviar para o CRM")
Conversa pessoal nasce **privada** (só o dono vê). Botão abre dialog: busca duplicados por telefone (últimos 8 dígitos + DDD, tolera 55/9º dígito), modos vincular/criar, validação de escopo, dedup defensivo server-side. Ao atribuir, grava `lead_id + lead_attributed_at + lead_attributed_by` → a conversa passa a ser visível (ro) para o escopo de gestão. Duplicado de outro corretor é permitido como lead separado (só alerta).

### 11.10 Outros
- **Favoritas**: ⭐ por usuário (`metadata.starred`), dropdown no header pula até a mensagem.
- **Silenciar**: localStorage local (não sincroniza — só mata o som no device).
- **Galeria**: abas Mídia (`image|video` com media_path), Documentos, Links (`content ILIKE '%http%'` + validação client).
- **Opt-out**: regex conservador (palavra exata PARAR/SAIR/CANCELAR/STOP) em inbound 1:1 → blacklist que bloqueia envios futuros.
- **Marcar lida**: zera `unread_count` + best-effort `POST /chat/read` (sincroniza o badge do celular).

---

## 12. Permissões e visibilidade (RBAC + RLS)

### 12.1 Capabilities

| Capability | Concede |
|---|---|
| `atendimento.view` | ver inbox (escopo-filtrado), paginar histórico, transcrever, favoritar |
| `atendimento.send` | enviar, conectar o próprio número pessoal, stickers, agendar, check-in |
| `atendimento.manage` | conectar/gerir plantão, pausar instâncias, transferir |

### 12.2 Nível de acesso por conversa — função pura `nivelAcessoConversa() → 'rw' | 'ro' | null`

Default **fail-closed** (source desconhecido = privado):

```
GRUPO (channel='whatsapp_group'):
  owner == viewer → rw ; senão → null (invisível p/ TODOS, sem exceção)

PLANTÃO (source='global'):
  transferida_pessoal?
    quem tinha rw → ro (encerrada p/ envio)
    histórico compartilhado + lead no escopo → ro
    senão → null
  ativa:
    escopo empresa → rw
    atribuída a mim/meu time → rw
    em disputa + sou membro da roleta → rw
    grant 'responder' na conexão → rw
    grant 'ver' → ro
    senão → null

PESSOAL (source='personal'):
  owner == viewer → rw
  lead atribuído? empresa → ro ; corretor do lead no meu escopo → ro
  senão → null
```

A mesma regra é espelhada em **RLS** no Postgres (defesa em profundidade — mesmo com bug no app, o PostgREST não vaza):

```sql
CREATE POLICY conversations_select_scoped ON conversations FOR SELECT TO authenticated
USING (
  tenant_id = (auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid
  AND (
    CASE WHEN channel = 'whatsapp_group' THEN
      owner_user_id IN (SELECT u.id FROM users u WHERE u.auth_user_id = auth.uid() AND ...)
    ELSE (
      source IS DISTINCT FROM 'personal'        -- global/canais futuros
      OR lead_attributed_at IS NOT NULL         -- pessoal já enviada ao CRM
      OR owner_user_id IN (SELECT ...)          -- pessoal privada → só o dono
    ) END
  )
);
-- messages espelha via EXISTS na conversa.
-- platform_admin lê tudo EXCETO grupos (suporte usa impersonation auditada).
-- ESCRITAS: apenas service-role (server actions); 'authenticated' nunca escreve direto.
```

### 12.3 Padrão das server actions

```typescript
try {
  const viewer = await requireCapability("atendimento.send");
  // escopo: nivelAcessoConversa === 'rw' (ou 'ro' p/ leitura)
  const result = await libFunction(...);
  // audit(...) nas mutações
  return { ok: true, ...result };
} catch (err) {
  rethrowIfRedirect(err);
  if (err instanceof AppError) return { ok: false, error: err.message };
  console.error(...); return { ok: false, error: "Erro ao ..." };
}
```

---

## 13. Decisões de design e gotchas

**Provider / webhook**
1. UAZAPI emite status em **Title Case** (`"Read"`) — normalizar case-insensitive, senão os ticks travam em ✓.
2. `excludeMessages: ["wasSentByApi"]` no registro do webhook é dedup primário do eco; a rota **revalida** (`direction=outbound && wasSentByApi → skip`) por causa de race conditions.
3. `contactName` sai do objeto `chat`, **nunca** de `senderName` quando `fromMe` (é o nome do corretor).
4. Mídia inbound não vem no webhook — buscar via `/message/download` em até ~2 dias, **assíncrono** (`after()`), nunca bloqueando o 200.
5. `/message/edit` retorna **novo** provider id — atualizar a row ou quebram reply/react/delete.
6. Webhook **sempre 200**; instância desconhecida → 200 silencioso (não vazar existência).
7. Status de mensagem é **forward-only** (rank); `failed` é terminal.
8. Dedup duplo em tudo (pre-check + UNIQUE) — webhooks reentregam e clientes reenviam.

**Envio / fluidez**
9. Fluidez = cliente (fila otimista); confiabilidade = servidor (grava-primeiro). Não inverter: disparar antes de gravar perde delivered/read, dedup e histórico.
10. `clientMessageId` é UUID v4 **validado por regex** no servidor (entra em índice — nunca aceitar string arbitrária do cliente).
11. Sem `revalidatePath` na action de envio (latência); realtime + refresh do worker cobrem.
12. Worker sequencial por conversa, paralelo entre conversas; `failed` não trava a fila.
13. Bolha de mídia: pruning só quando a row tem signed URL (sem flash de preview); revogar blob URLs.
14. Sem retry automático no servidor — falha é explícita com Reenviar manual (exceto agendadas com limite transitório, que se auto-adiam 30 min).
15. Perfis de throttle: `interactive` isento (humano respondendo); `automated`/`scheduled` respeitam limites de aquecimento — anti-ban do número.
16. Cooldown 24h pós-conexão para contatos que nunca mandaram inbound (anti-ban); grupos isentos.

**Dados / privacidade**
17. Conversa pessoal nasce privada; atribuição ao CRM é **ato explícito** do dono (`lead_attributed_at`).
18. Grupo é owner-only **absoluto** — nem platform admin (achado de review adversarial: policy permissiva com OR dava acesso silencioso).
19. `owner_user_id` (imutável) ≠ `assigned_user_id` (dinâmico). Privacidade ancora no owner; transferência zera o assigned.
20. Soft-delete em mensagens (auditoria + replies continuam resolvendo).
21. `metadata` JSONB para features novas (reações, favoritas, edited, via) — evita migration por feature.
22. CHECK de conteúdo em agendadas condicionado ao status (FK `SET NULL` não pode invalidar histórico).
23. Trigger no banco para preview/unread — um INSERT atualiza a lista de todos os clients via realtime, sem código de app.

**UI**
24. `key={conversationId}` remonta a thread de propósito (estado local zerado).
25. `useSyncExternalStore` para tudo que lê localStorage (zero hydration mismatch).
26. Sem virtualização de lista — janela de 60 + infinite scroll dá conta; IntersectionObserver com rootMargin pré-carrega.
27. Toolbar de formatação usa `onMouseDown` (não onClick) para não perder a seleção; popover de menção usa `preventDefault` para não roubar foco.
28. Fuso de agendamento fixo (America/Sao_Paulo) independente do browser.
29. Áudio: OGG/Opus 16kHz mono `ptt` = nota de voz nativa no WhatsApp; hack de duration para WebM/Opus (seek 1e101).
30. Um relógio compartilhado (60s) para todos os cards, não um timer por card.

---

## 14. Checklist de implementação em outro CRM

Ordem recomendada (espelha a evolução real do First360 — cada fase é utilizável sozinha):

**Fase 1 — Fundação**
- [ ] Tabelas: `platform_integrations`, `whatsapp_instances`, `conversations`, `messages`, `whatsapp_optouts` + trigger `on_new_message` + índices de dedup + bucket privado de mídia.
- [ ] Criptografia de tokens em repouso (AES-256-GCM) + config global com fallback em env.
- [ ] Client UAZAPI (endpoints §3.2, extractors tolerantes §3.4).
- [ ] Ciclo de vida de instância: criar → registrar webhook → QR com polling → status → desconectar.
- [ ] Webhook route: secret na URL, parser de eventos, pipeline §5.3, mídia assíncrona, sempre 200.
- [ ] Envio servidor: pipeline §6.1 com idempotência por `client_message_id`.

**Fase 2 — UI essencial**
- [ ] Layout 3 colunas; lista de conversas (filtro client-side, badges, preview via trigger).
- [ ] Thread: janela 60 + infinite scroll com âncora; agrupamento por data/continuação; bolhas com ticks.
- [ ] Composer mínimo: texto + Enter + anexos.
- [ ] **Fila otimista** (§7 completa): store module-level, worker sequencial, merge por clientMessageId, prune, retry/discard.
- [ ] Realtime: publication no banco, `setAuth` no socket, filtro por tenant, `router.refresh()`.

**Fase 3 — Recursos de mensagem**
- [ ] Mídia rica (lightbox, álbuns, player de áudio), reply/quote, reações (toggle + webhook), apagar/editar, autoria viewer-aware (`sent_by_user_id`).
- [ ] Gravação de áudio PTT (opus 16kHz mono), formatação WhatsApp (toolbar + tokenizer), emoji picker.

**Fase 4 — Produtividade**
- [ ] Respostas rápidas (empresa/pessoal, mídia), mensagens agendadas (cron com claim atômico), lembretes, favoritas, busca na thread, galeria, stickers, transcrição.

**Fase 5 — Privacidade e times**
- [ ] Modelo personal/global, privacidade de conversa pessoal + atribuição ao CRM, RLS em profundidade, grupos owner-only, plantão/roleta/transferências (se aplicável).

**Variáveis de ambiente mínimas**:
```env
UAZAPI_API_URL=https://api.uazapi.com
UAZAPI_ADMIN_TOKEN=...
UAZAPI_WEBHOOK_SECRET=<random forte — vai na URL do webhook>
NEXT_PUBLIC_APP_URL=https://app.exemplo.com   # base da URL do webhook (sem / final)
AI_KEY_ENCRYPTION_SECRET=<32 bytes hex — AES dos tokens>
CRON_SECRET=<auth dos crons>
```

---

*Documento gerado em 2026-06-11 a partir de varredura completa do código do First360 (branch `feat/automacoes-coluna`): adapter `src/lib/whatsapp/`, backend `src/lib/atendimento/`, UI `src/app/(tenant)/(app)/atendimento/`, migrations 023–051 e specs de design em `docs/superpowers/`.*
