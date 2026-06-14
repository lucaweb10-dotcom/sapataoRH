# SP1c — Mídia (2 vias) + Analisar Currículo · Design / Spec

**Produto:** Sapatão RH · **Fatia:** SP1c (terceira/última da SP1 — Central de Atendimento)
**Data:** 2026-06-13 · **Status:** Aprovado para implementação
**Base:** SP1a (recebimento) + SP1b (envio) concluídas. Espelho §3.3 (send/download de mídia), §5.3 (download assíncrono), §7 (preview otimista). PRD §7.5 (botão Analisar Currículo).

---

## 1. Contexto e objetivo

SP1a recebe texto; SP1b envia texto. **A SP1c fecha a SP1 com mídia:** o candidato manda o currículo (PDF/foto) → o RH baixa/vê na plataforma e responde com imagem/documento; e o botão **"Analisar Currículo"** aparece em anexos PDF/DOC/DOCX (só a fiação; a IA é a SP3).

**Objetivo / demo:** candidato envia um currículo em PDF → aparece na conversa como anexo clicável (com botão "Analisar Currículo") em ≤ alguns segundos; o RH envia uma imagem de volta e ela aparece na hora (preview local) e confirma.

> **Crítico (espelho):** a mídia recebida **não vem no webhook** — só o id. É preciso baixar via `/message/download` de forma **assíncrona** (`after()`), nunca bloqueando o 200. É a área mais bug-prone; tratada com cuidado.

---

## 2. Decisões adotadas

| Decisão | Escolha |
|---------|---------|
| Download de entrada | Assíncrono em `after()` (Next 16), via service role; **idempotente** (pula se a mensagem já tem `midia_url`). |
| Armazenamento | Bucket privado `whatsapp-media` (já criado na SP1a); path `{empresa_id}/{provider_msg_id}.{ext}`; **guarda o path** em `messages.midia_url`, e a UI gera **signed URL** server-side ao renderizar (TTL ~1h). |
| Envio de mídia | `POST /api/whatsapp/send-media` (write-first, igual ao texto): upload p/ bucket → `client.sendMedia` → `sent`/`failed`. |
| Preview otimista (saída) | Bolha local com `URL.createObjectURL` imediato, reconciliada via realtime; revoga o objectURL ao podar (no-flash). Reusa a fila Zustand (item de mídia). |
| Migrations | **Nenhuma nova** — `messages` já tem `midia_url`, `midia_mime`, `thumbnail_url`, `tipo`. |
| Analisar Currículo | Botão em mensagens `tipo='document'` com mime PDF/DOC/DOCX — **só fiação** (toast "Análise de IA chega na SP3"). |

---

## 3. Cliente UAZAPI — adições (`lib/uazapi/client.ts`)

- `downloadMedia(token, providerMessageId)` → `POST /message/download` `{ id, return_base64: true, return_link: false }` → retorna `{ base64: string | null, mime: string | null }` (extração tolerante: `.base64 → .data → .file`; mime `.mimetype → .mime`).
- `sendMedia(token, number, { type, fileBase64, mimetype, docName?, caption? })` → `POST /send/media` `{ number, type, file: fileBase64, mimetype, docName?, text: caption? }` (⚠️ legenda no campo **`text`**, não `caption`; `docName` só p/ documento). Retorna `{ providerId }` via `extractMessageId`. `type`: `image | video | audio | ptt | document`.

---

## 4. Helpers de mídia (`lib/whatsapp/media.ts`) — TDD

- `mimeToExt(mime)` → extensão (`image/jpeg`→`jpg`, `application/pdf`→`pdf`, `audio/ogg`→`ogg`, fallback `bin`). TDD.
- `tipoFromMime(mime)` → `'image'|'audio'|'video'|'document'` (default `document`). TDD.
- `isCurriculoDoc(mime)` → true p/ `application/pdf`, `application/msword`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`. TDD.
- `downloadAndStoreInbound({ empresaId, providerMessageId, token }, deps)` — **injetável** (deps: `getMessage(providerMessageId)→{id, midia_url, midia_mime}|null`, `download(token, id)→{base64,mime}`, `upload(path, bytes, mime)→{error}`, `setMedia(messageId, {midia_url, midia_mime})`). Fluxo:
  1. `getMessage` → se já tem `midia_url` → **skip** (idempotente; redelivery).
  2. `download` → base64 + mime. Se vazio → log + return.
  3. decode base64 → bytes; path `{empresaId}/{providerMessageId}.{mimeToExt(mime)}`; `upload`.
  4. `setMedia(messageId, { midia_url: path, midia_mime: mime })`.
  TDD: skip-quando-já-tem-mídia, caminho feliz, download vazio (no-op).

---

## 5. Webhook — download de entrada (modificar a rota)

Na rota do webhook, após `handleInboundMessage` para um evento `message` inbound cujo `messageType` é mídia (image/audio/video/document/ptt): agendar `after(async () => { downloadAndStoreInbound(...) })` (import `{ after } from "next/server"`). Usa o admin client (service role; bypassa storage RLS). **Nunca bloqueia o 200.** Idempotente (o helper pula se já há `midia_url`).

---

## 6. Exibição de mídia (chat)

- `lib/chat/signed-url.ts` (server): `signedMediaUrl(path)` → `supabase.storage.from('whatsapp-media').createSignedUrl(path, 3600)`; null se sem path. Usado nos loaders/no render.
- Na `loadThread`/no render das bolhas: para mensagens com `midia_url` (path), gerar signed URL server-side e passar à bolha.
- `message-thread` (modificar): renderizar por tipo —
  - `image`: `<img>` com a signed URL (max-w, rounded).
  - `audio`/`ptt`: `<audio controls>`.
  - `document`: cartão com nome (de `metadata.fileName` ou genérico) + ícone + link de download (signed URL) + **botão "Analisar Currículo"** se `isCurriculoDoc(midia_mime)`.
  - texto: como já é.

---

## 7. Envio de mídia (saída)

- `lib/whatsapp/send-media.ts` — serviço write-first injetável (espelho-style), análogo a `send.ts`: insere `messages` `status='queued'` (tipo do mime, `midia_url` = path do upload, `conteudo` = legenda, `client_message_id`), faz upload do arquivo ao bucket (history), chama `sendMedia`, marca `sent`/`failed`. Idempotente por `client_message_id`. TDD com deps mockados.
- `POST /api/whatsapp/send-media` (auth admin/rh): recebe `{ conversationId, clientMessageId, fileBase64, mime, fileName?, caption? }` (Zod). Adapter `SendMediaDeps` sobre o admin client; resolve telefone+token; chama o serviço. Mapas de status como em `/send`.
- **Composer** (modificar): botão de anexo (`accept="image/*,.pdf,.doc,.docx"`). Ao selecionar: para cada arquivo, lê como base64 + cria `objectURL` p/ preview; enfileira um item de mídia na fila Zustand (estende `QueueItem` com `media?: { objectUrl, mime, fileName }`); o `dispatch` posta em `/api/whatsapp/send-media`. Limpa o input. A bolha otimista mostra o preview local (image) ou o nome (document) com tick de status.
- **Merge/poda otimista**: a bolha de mídia herda o `objectURL` local até a row do servidor ter signed URL (sem flash); revoga o `objectURL` ao podar.

---

## 8. "Analisar Currículo" (fiação)

- Botão na bolha de documento (PDF/DOC/DOCX). Ao clicar: por ora `toast("Análise de IA chega na SP3")` (ou um endpoint stub `POST /api/cv/analyze` que retorna 501 "não implementado"). **Sem IA, sem extração de texto** — apenas o gancho de UI + (opcional) marcar `candidatos.curriculo_url` com o path do anexo recebido (útil p/ a SP3). Marcar `curriculo_url` no download de entrada quando for documento de currículo é um extra leve.

---

## 9. Testes (TDD)

- `mimeToExt`, `tipoFromMime`, `isCurriculoDoc` (tabela de casos).
- `downloadAndStoreInbound` (deps mockados): skip-com-mídia, feliz, download-vazio.
- Serviço de envio de mídia (`enviarMidia`, deps mockados): write-first (queued→sent), idempotência, falha do provider (→failed), opt-out.
- (Webhook media wiring é integração — coberto por simulação no E2E.)

---

## 10. Fronteira de escopo (não é SP1c)

- **IA de análise de currículo** (extração de texto PDF/DOCX/OCR, score, parecer) → **SP3**.
- Transcrição de áudio, stickers, galeria de mídia, reações/edição → fora/depois.
- Agendamento, grupos, plantão → fora.

---

## 11. Critérios de aceitação (SP1c)

1. Webhook recebe uma mensagem de mídia (simulada) → agenda o download em `after()`; o helper baixa (download mockado), faz upload e seta `midia_url`/`midia_mime`; redelivery não re-baixa (idempotente).
2. A thread renderiza imagem inline, áudio com player e documento como cartão com download (signed URL).
3. Documento PDF/DOC/DOCX mostra o botão **"Analisar Currículo"**; clicar dá o toast/501 (SP3).
4. `POST /api/whatsapp/send-media` insere a mensagem `queued`, faz upload, chama `sendMedia` → `sent` (ou `failed` gracioso sem UAZAPI). Idempotente por `client_message_id`.
5. Composer anexa imagem/PDF; a bolha otimista mostra o preview local na hora; reconcilia via realtime; sem flash de preview.
6. ≥60% de cobertura na lógica nova (media helpers, download, envio de mídia); `tsc` limpo; build OK; testes SP1a/SP1b verdes.

---

## 12. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Mídia não vem no webhook (só id) | Download via `/message/download` em `after()`, nunca bloqueia o 200. |
| Re-download em redelivery | `downloadAndStoreInbound` pula se a mensagem já tem `midia_url`. |
| Signed URL expira | Guardar o **path**; gerar signed URL no render (server, TTL 1h). |
| Vazamento de mídia entre empresas | Path começa com `{empresa_id}/`; storage RLS por `foldername[1]`; signed URL gerada server-side com RLS. |
| Memory leak de objectURL | `URL.revokeObjectURL` ao podar/desmontar a bolha otimista. |
| Legenda no campo errado | `sendMedia` usa `text` (não `caption`), conforme espelho. |
| Base64 grande no body | Limite de tamanho no Zod/route; documentos de RH são pequenos; (uploads grandes = melhoria futura via URL pública). |

---

**Fim — SP1c Design v1.0**
