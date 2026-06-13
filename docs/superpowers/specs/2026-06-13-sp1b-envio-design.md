# SP1b — Envio + Fila Otimista (Central de Atendimento) · Design / Spec

**Produto:** Sapatão RH · **Fatia:** SP1b (segunda de três da SP1 — Central de Atendimento)
**Data:** 2026-06-13 · **Status:** Aprovado para implementação
**Base:** SP1a (recebimento) concluída na branch `feat/sp1a-recebimento`. Blueprint: espelho §6 (pipeline de envio) e §7 (fila otimista). PRD §7.3.

---

## 1. Contexto e objetivo

A SP1a recebe e exibe mensagens (chat somente leitura). A **SP1b habilita o envio** com a sensação de WhatsApp Web: o recrutador digita, a bolha aparece **instantânea**, o campo limpa na hora, e a consistência é reconciliada em background.

**Objetivo / demo:** RH abre uma conversa, digita e envia → a mensagem aparece imediatamente (tick "enviando"), some o badge de não-lidas, e os ticks avançam (enviado → entregue → lido) conforme a UAZAPI confirma.

> Mídia (envio de imagem/documento, download de entrada) é **SP1c**. SP1b é **só texto**.

---

## 2. Decisões adotadas (da análise da SP1)

| Decisão | Escolha |
|---------|---------|
| Origem do envio | **`POST /api/whatsapp/send`** (auth via `getCurrentProfile`, consistente com `/api/usuarios`). |
| Fila otimista | **Zustand** (stack da SP0), preservando a semântica do espelho: worker sequencial por conversa, merge por `client_message_id`, retry/descarte. |
| Confiabilidade | **Grava-primeiro** (`status='queued'` antes de chamar o provider). A fluidez vem 100% do cliente. |
| Retry | **Sem retry automático no servidor** (risco de envio duplicado). Retry é **manual no cliente**, reusando o mesmo `client_message_id`. |
| Status | **Forward-only** (`queued < sent < delivered < read`; `failed` terminal) via webhook `messages_update`. |
| Migrations | **Nenhuma nova** — a tabela `messages` da SP1a já tem `client_message_id`, `status`, `sender_id`, `uazapi_msg_id`, `metadata`, e os índices de dedup. |

---

## 3. Cliente UAZAPI — adições (`lib/uazapi/client.ts`)

- `sendText(token, number, text, replyId?)` → `POST /send/text` (header `token`, sem Bearer): `{ number (dígitos, sem +), text, replyid? }`. Resposta: id do provider via extrator tolerante (`.messageid → .id → .key.id → ...`, reusar `extractMessageId`). Sem retry, sem timeout custom (regra do espelho).
- `markChatRead(token, number)` → `POST /chat/read`: `{ number, read: true }` (best-effort).

---

## 4. Serviço de envio (`lib/whatsapp/send.ts`) — grava-primeiro, injetável

Espelho §6 (9 etapas), adaptado e **testável por injeção** (mesmo padrão de `create-usuario.ts`/`inbound.ts`: uma interface `SendDeps` com os métodos que o serviço usa — buscar conversa+instância+token, checar opt-out, checar/idempotência por `client_message_id`, inserir/atualizar mensagem, e um `sendText`). O route adapta o admin client real a `SendDeps`.

**Fluxo `enviarMensagem({ empresaId, conversationId, texto, clientMessageId, senderId }, deps)`:**
1. **Carrega** a conversa (tenant guard), o candidato (telefone) e a instância (token via service role).
2. **Idempotência:** se já existe mensagem com `client_message_id`:
   - status ≠ `failed` → retorna a row vencedora (double-submit = no-op).
   - status = `failed` → reusa a row (reenvio sem duplicar).
3. **Opt-out:** telefone na blacklist → retorna `{ ok:false, error:'optout' }` (não insere).
4. **INSERT** `messages` `status='queued'` (`direction='outbound'`, `client_message_id`, `sender_id`, `conteudo=texto`). Race no índice único `(empresa_id, client_message_id)` (23505) → re-SELECT e retorna a vencedora.
5. **CHAMA** `sendText(token, telefone, texto)`.
   - sucesso → UPDATE `status='sent'`, `uazapi_msg_id`. Retorna `{ ok:true, message }`.
   - falha → UPDATE `status='failed'`, `metadata.error`. Retorna `{ ok:false, error:'send_failed', message }`.

> Sem `throttle` (perfil sempre "interactive" — humano respondendo inbound, isento). Sem retry de servidor.

---

## 5. Rota `POST /api/whatsapp/send`

- Auth: `getCurrentProfile()` → exige `admin`/`rh` (ou platform_admin), senão 403.
- Valida o corpo com Zod (`sendMessageSchema`: `conversationId: uuid`, `texto: string().min(1)`, `clientMessageId: uuid`).
- Monta `SendDeps` sobre `createAdminClient()` (service role — lê o token; bypassa RLS). Resolve `empresa_id` do profile; guard: a conversa pertence ao `empresa_id`.
- Chama `enviarMensagem(...)`. Mapeia: ok → 201 `{ message }`; `optout` → 409; `send_failed` → 502 `{ message }` (a row `failed` existe; o cliente reusa no retry); inválido → 422; sem permissão → 403.
- **Sem `revalidatePath`** (a página é dinâmica; atualiza via realtime + `router.refresh()` do worker).

---

## 6. Fila otimista no cliente (`stores/send-queue.ts`, Zustand) + composer

Espelho §7 — a peça da UX. **Store em nível de módulo** (fora do React render, sobrevive à troca de conversa).

**Item da fila:** `{ clientMessageId, conversationId, texto, optimistic (bolha pré-montada status 'sending'), status: 'pending'|'sending'|'sent'|'failed', error, attempts }`.

**`handleSend()` (síncrono, zero await no caminho crítico):**
1. `clientMessageId = crypto.randomUUID()`.
2. monta `optimistic` (status 'sending', createdAt agora).
3. enfileira + dispara `runWorker(conversationId)`.
4. limpa o textarea **na hora**.

**Worker** (`runWorker`): sequencial **por conversa**, paralelo **entre conversas**, guard de reentrância. Pega o 1º `pending`, marca `sending`, chama `fetch('/api/whatsapp/send', { clientMessageId, conversationId, texto })`, marca `sent`/`failed`, e dispara `router.refresh()` (fallback do realtime). `failed` **não trava** a fila (fica com Reenviar/Descartar). Exceção → `failed` ("Sem conexão").

**Merge com o servidor** (no `message-thread`): mensagens do servidor (ordem `created_at`) + bolhas locais não confirmadas. **Dedup por `client_message_id`: a row do servidor sempre vence.** Pruning: remove a bolha local quando a row do servidor com o mesmo `client_message_id` chega.

**Retry/Descartar:** Reenviar → volta a `pending` (mesmo `client_message_id` → servidor reusa a row `failed`). Descartar → remove da fila + (opcional) hard-delete da row `failed`.

**Composer** (habilitar o desabilitado da SP1a): textarea, **Enter envia / Shift+Enter quebra linha**, chama `handleSend`. Ícones de status: sending → relógio, sent → ✓, delivered → ✓✓, read → ✓✓ azul, failed → ✗ + ações.

---

## 7. Status forward-only (`lib/whatsapp/status.ts` + webhook)

- `lib/whatsapp/status.ts` (TDD): `advanceStatus(current, incoming)` → aplica rank `queued(0) < sent(1) < delivered(2) < read(3)`; só avança se `rank(incoming) > rank(current)`; `failed` é terminal (define `failed` a menos que já esteja `delivered`/`read`); status fora de ordem são ignorados.
- No webhook route (`event.kind==='status'`): localiza a mensagem por `uazapi_msg_id` (na empresa), calcula `advanceStatus`, e UPDATE se mudou. (`deleted` é ignorado na SP1b — soft-delete é fatia futura.)

---

## 8. Marcar como lida (`marcarConversaLida`)

- Server action `marcarConversaLida(conversationId)` (auth admin/rh, tenant guard): zera `conversations.unread_count`; best-effort `markChatRead(token, telefone)` via service role (não bloqueia).
- Chamada quando o chat exibe uma conversa (na `chat/page.tsx`, após carregar a thread da conversa ativa) — ou via um pequeno client trigger ao abrir. Implementação: chamar na página server-side ao resolver `displayedConv` (zera o badge ao abrir).

---

## 9. Testes (TDD)

- **`advanceStatus`**: todos os caminhos (avanço, fora de ordem ignorado, failed terminal, idempotente).
- **Serviço de envio** (`enviarMensagem`, deps mockados): grava-primeiro (queued→sent), idempotência (double-submit no-op; failed reusa), opt-out (não insere), falha do provider (queued→failed).
- **Fila otimista** (lógica pura do store): enfileirar, worker sequencial por conversa, failed não trava, merge/dedup por `client_message_id`, retry reusa o id.
- (Webhook status já tem cobertura do parser; adicionar um teste do route handler de status é opcional.)

---

## 10. Fronteira de escopo (não é SP1b)

- **Mídia** (enviar imagem/documento, download de entrada, botão "Analisar Currículo", preview objectURL) → **SP1c**.
- Apagar/editar mensagem, reações, agendadas, templates-no-composer (a inserção de template no composer pode entrar como extra leve se sobrar) → fatias futuras.
- Transcrição, grupos, plantão → fora.

---

## 11. Critérios de aceitação (SP1b)

1. RH envia texto numa conversa → `POST /api/whatsapp/send` insere `messages` `queued` → (com UAZAPI) vira `sent` com `uazapi_msg_id`; sem UAZAPI configurada, vira `failed` graciosamente (testável simulando a dep `sendText`).
2. **Idempotência:** dois POSTs com o mesmo `client_message_id` = uma mensagem só.
3. **Opt-out:** enviar para telefone na blacklist é bloqueado.
4. **Fila otimista:** a bolha aparece na hora; o campo limpa; `failed` mostra Reenviar/Descartar; reenviar reusa o `client_message_id`.
5. **Forward-only:** um webhook `messages_update` 'Read' → status vira `read`; um 'Sent' chegando depois NÃO regride o tick.
6. **Marcar lida:** abrir uma conversa zera `unread_count`.
7. Composer: Enter envia, Shift+Enter quebra linha.
8. ≥60% de cobertura na lógica (advanceStatus, serviço de envio, fila); `tsc` limpo; `npm run build` OK; testes da SP1a continuam passando.

---

## 12. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Envio duplicado | Grava-primeiro + índice único `(empresa_id, client_message_id)` + handler 23505; retry reusa o id. |
| Tick "voltando" (webhook fora de ordem) | `advanceStatus` forward-only; `failed` terminal. |
| Sem UAZAPI configurada | Envio falha graciosamente (row `failed`, cliente reusa); testes simulam a dep `sendText`. |
| Token exposto | `sendText` recebe o token só no server (route via service role); nunca vai ao cliente. |
| Eco da própria mensagem (webhook) | `excludeMessages:['wasSentByApi']` + skip de outbound na rota (já na SP1a). |
| Latência percebida | Fila otimista (bolha imediata) + sem `revalidatePath` no envio. |

---

**Fim — SP1b Design v1.0**
