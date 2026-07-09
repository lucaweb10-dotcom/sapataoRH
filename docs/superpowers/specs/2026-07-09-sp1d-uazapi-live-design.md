# SP1d — UAZAPI ao vivo + Credenciais na tela (Central de Atendimento) · Design / Spec

> Data: 2026-07-09 · Fatia: SP1d (fecha a SP1 contra o gateway real)
> Pré-requisitos: SP1a/b/c completas (webhook, envio, mídia — tudo validado por simulação).
> Fontes de verdade: `Uazapi docs/uazapi-openapi-spec.yaml` (spec OpenAPI oficial salva no repo) e
> `Uazapi docs/espelho-atendimento-uazapi.md`. Payload do webhook (envelope) só é 100% validável
> com tráfego real — ver §6 (diagnóstico).

## 1. Contexto e objetivo

A Central de Atendimento (SP1) está funcional em simulação: o client UAZAPI (`lib/uazapi/client.ts`)
já faz HTTP real, a página Configurações>WhatsApp já tem o fluxo Conectar/QR/polling, e o webhook
`/api/whatsapp/webhook/[instanceId]` recebe eventos com dedup e idempotência. Faltam três coisas
para o vivo: (a) credenciais — hoje só via env `UAZAPI_API_URL`/`UAZAPI_ADMIN_TOKEN`, ausentes no
`.env.local`; (b) correções no client — a validação contra a spec OpenAPI encontrou bugs que
quebrariam o vivo; (c) um caminho para a UAZAPI alcançar o app local (decisão do usuário: túnel).

**Objetivo:** admin cola as credenciais UAZAPI em Configurações>WhatsApp, conecta via QR code,
registra o webhook do túnel com 1 clique, e a Central envia/recebe texto e mídia de verdade —
com diagnóstico ao vivo dos eventos recebidos e prova E2E automatizada via gateway falso.

## 2. Decisões adotadas

- **Credenciais por empresa no banco** (colunas novas em `whatsapp_instances`), editadas na tela.
  Fallback para env preservado (DB → env). Rejeitado: env-only (pedido explícito do usuário);
  tabela genérica de integrações (YAGNI até existir 2ª integração).
- **Recebimento local via túnel** (cloudflared/ngrok) — decisão do usuário. SSE fica fora de escopo.
- **Modo simples de webhook da UAZAPI** (sem `action`/`id` — cria/atualiza webhook único) com
  `events: ["messages","messages_update","connection"]` e `excludeMessages: ["wasSentByApi"]`
  (recomendação oficial anti-loop; o echo da API não volta — o app já grava o outbound no envio).
- **Validação final ao vivo pelo usuário** (tem conta UAZAPI; cola credenciais na tela ao final).

## 3. Dados — migration 0017

`alter table whatsapp_instances add column`:
- `uazapi_base_url text` — ex.: `https://xxxx.uazapi.com` (sem barra final; normalizar ao salvar).
- `uazapi_admin_token text` — SENSÍVEL (cria instâncias).
- `webhook_public_url text` — base pública do app (túnel ou domínio de produção).

Segurança (mesmo padrão do `uazapi_token` da 0005/0007): os grants de SELECT para
`anon`/`authenticated` são **por coluna**, então as colunas novas já nascem inacessíveis ao
browser; a view `whatsapp_instances_safe` NÃO as inclui (conferir e manter). Escrita/leitura só
via service role em server actions. RLS existente inalterada.

Tabela nova `whatsapp_webhook_events` (diagnóstico, §6):
- `id uuid pk default gen_random_uuid()`, `empresa_id uuid not null references empresas on delete cascade`,
  `event text`, `parsed_kind text` (`message|status|connection|ignore|parse_error`),
  `payload jsonb not null`, `created_at timestamptz default now()`.
- Índice `(empresa_id, created_at desc)`. RLS: SELECT só `admin`/`platform_admin` do tenant;
  INSERT/DELETE só service role (sem policy de escrita para authenticated).
- Retenção: após inserir, o webhook apaga o excedente além dos **50 mais recentes** por empresa
  (delete via service role no mesmo request, best-effort).

Tipos: atualizar `types/database.ts` (Row types como type alias + `Relationships: []` — gotcha do
projeto) sem quebrar a inferência de joins existente.

## 4. Client UAZAPI — correções validadas pela spec (`lib/uazapi/client.ts`)

1. **`baseUrl` deixa de ser global-env**: todas as funções passam a receber `baseUrl` explícito
   (novo 1º parâmetro ou objeto config). Helper novo `getUazapiConfig(admin, empresaId)` em
   `lib/uazapi/config.ts`: lê `whatsapp_instances` (service role) e resolve
   `{ baseUrl, adminToken }` com fallback `process.env.UAZAPI_API_URL`/`UAZAPI_ADMIN_TOKEN`;
   erro tipado `uazapi_nao_configurada` quando ambos ausentes.
2. **`createInstance`**: resposta real é `{ token, instance: {...} }` com `instance` **objeto**
   (schema `Instance`: `id`, `token`, `status`, `qrcode`, `paircode`). Extrair
   `instanceId = instance.id ?? body.instanceId ?? body.id` e
   `token = body.token ?? instance.token`. (Bug atual: castava `instance` como string.)
3. **`instanceStatus`**: resposta real é `{ instance: {...}, status: { connected, loggedIn } }` —
   `status` do topo é **objeto**. Ler `instance.status` (`disconnected|connecting|connected`);
   fallback: derivar de `status.connected/loggedIn`. Retornar também `qr: instance.qrcode ?? null`
   e `paircode: instance.paircode ?? null` (spec: o status devolve QR **renovado** durante a
   conexão — base do refresh do §5). (Bug atual: lia `body.state/status` → sempre errado.)
4. **`downloadMedia`**: resposta real é `{ fileURL, mimetype, base64Data, transcription }`.
   Adicionar **`base64Data`** como primeira opção de extração (mantém tolerância aos demais).
   (Bug atual: sem isso, mídia recebida nunca seria salva no Storage.)
5. **`markChatRead`**: spec pede `number` em formato JID (`5511...@s.whatsapp.net`). Anexar
   sufixo quando ausente. Continua best-effort (falha não propaga).
6. **`registerWebhook`**: já correto (modo simples). Apenas garantir URL sem barra dupla e
   permitir re-registro idempotente (modo simples atualiza o webhook único).
7. `sendText`/`sendMedia`: já corretos (`text` carrega a legenda em `/send/media`; `docName` só
   para documento). Sem mudanças além do `baseUrl` explícito.

## 5. Tela Configurações > WhatsApp (admin-only, como hoje)

Três blocos no `WhatsappInstancePanel` (ou componentes irmãos na mesma página):

- **Credenciais UAZAPI**: inputs `uazapi_base_url` e `uazapi_admin_token` (tipo password,
  write-only: mostra só `••••` + últimos 4 quando salvo), botão **Salvar credenciais** (server
  action `salvarCredenciais` — valida URL https e não-vazio via Zod, normaliza, grava via service
  role, `revalidatePath`). O bloco "UAZAPI não configurada" atual passa a apontar para este form
  (não mais para env).
- **Conexão** (evolução do fluxo atual): Conectar → QR code + **paircode** quando disponível;
  polling de 5s continua, mas agora **renova a imagem do QR** a cada consulta (statusInstancia
  retorna `qr`); Desconectar; badge de status. Erros do gateway aparecem como toast/inline
  (mensagem da `UazapiError`).
- **Webhook & Diagnóstico**: input `webhook_public_url` + botão **Salvar e registrar webhook**
  (server action `registrarWebhookAction`: grava a URL, monta
  `{url}/api/whatsapp/webhook/{uazapi_instance_id}?secret={webhook_secret}` e chama
  `registerWebhook`); mostra a URL efetiva registrada e aviso quando `webhook_public_url` ausente
  (instrução curta do túnel). Painel **Últimos eventos** (§6): tabela com `created_at`, `event`,
  `parsed_kind` e expansão do JSON bruto (`<details>`), lidos de `whatsapp_webhook_events` via
  RLS (admin). Botão Atualizar (refresh server-side; sem realtime — YAGNI).

`conectar()` passa a: usar `getUazapiConfig` (DB→env); registrar webhook automaticamente **se**
`webhook_public_url` (ou `NEXT_PUBLIC_APP_URL`) existir — senão segue conectando e a UI indica
"webhook pendente de registro".

## 6. Diagnóstico de payload real (de-risco do parser)

O envelope do webhook (nomes no topo: `event`, `instance`, `message`, `chat`) foi assumido do
espelho; o schema `Message`/`Chat` da spec confirma os campos internos (`messageid`, `chatid`,
`sender`, `senderName`, `fromMe`, `wasSentByApi`, `messageType`, `text`, `chat.wa_name`,
`chat.wa_contactName`, `chat.name`), mas o envelope em si não aparece na spec. Mitigação:

- O webhook route grava **todo** request em `whatsapp_webhook_events` (payload bruto + como o
  parser classificou), inclusive os que caem em `ignore`/erro de parse — ANTES de responder 200.
  Gravação best-effort (falha de log nunca derruba o 200) e fora do caminho crítico de mídia.
- Parser ganha tolerância extra barata: aceitar `EventType` como sinônimo de `event` no topo e
  media mime via `message.content.mimetype` (content pode ser JSON serializado — parse tolerante)
  além de `message.mimetype`/`mime`. Mantém contrato `ParsedEvent` inalterado.
- Se o tráfego real divergir, o ajuste é 1 função pura (`parseUazapiEvent`) com teste novo a
  partir do payload capturado no painel — sem caçar no escuro.

## 7. Verificação — testes + E2E com gateway falso

- **Unit (TDD, vitest)**: `getUazapiConfig` (DB, fallback env, ausente); extrações novas do client
  (fixtures copiadas dos exemplos da spec: create/status/download); `markChatRead` JID; parser com
  `EventType`/`content.mimetype`; validação Zod de `salvarCredenciais`; retenção 50 (lógica pura).
  Suíte atual (190) permanece verde — as assinaturas do client mudam, ajustar mocks existentes.
- **E2E `supabase/verify-sp1d-uazapi.mjs`** (padrão dos verify-*.mjs): sobe gateway UAZAPI falso
  em `http://127.0.0.1` numa porta efêmera (node http puro, respostas literais dos exemplos da spec:
  `/instance/create`, `/instance/connect` com qrcode, `/instance/status`, `/webhook`, `/send/text`,
  `/send/media`, `/message/download` com `base64Data`, `/chat/read`) e roda o ciclo contra o app
  local + Supabase local: salvar credenciais (DB) → conectar → registrar webhook → simular
  inbound texto e mídia (POST no webhook do app com envelope do espelho) → enviar texto e mídia
  (rotas `/api/whatsapp/send*`) → eventos de status → asserts no DB (mensagens, candidato,
  storage, `whatsapp_webhook_events`, status forward-only). Registra também que o gateway falso
  recebeu os bodies esperados (asserts de contrato).
- **Validação ao vivo (usuário)**: runbook `docs/superpowers/runbooks/uazapi-live.md` — passos:
  subir túnel (`cloudflared tunnel --url http://localhost:3000` ou ngrok), colar credenciais e
  URL pública na tela, Conectar + escanear QR, mandar mensagem de teste para o número, conferir
  painel de eventos e chat, responder pela Central e conferir no celular. Inclui troubleshooting
  (QR expirado → repolling renova; evento não chega → conferir painel/URL do túnel; parser
  divergente → copiar JSON do painel).

## 8. Fronteira de escopo (não é SP1d)

- HMAC/assinatura no webhook (mantém `webhook_secret` na query, fail-closed 200 silencioso).
- SSE como canal de recebimento.
- LLM real na análise de CV + OCR (SP3b); UI de critérios de IA (SP3b).
- Multi-instância por empresa (segue 1, índice único existente).
- Envio de template/campanha em massa (`/sender/*`).

## 9. Critérios de aceitação

1. Admin salva URL base + admin token na tela; browser nunca recebe os tokens (view/grants).
2. Conectar gera QR que **se renova** no polling; status persiste `conectado/connecting/...`.
3. Salvar URL pública + registrar webhook funciona com 1 clique e é re-executável (idempotente).
4. `verify-sp1d-uazapi.mjs` passa: ciclo completo enviar/receber texto+mídia contra gateway falso,
   incluindo download de mídia via `base64Data` e status forward-only.
5. Painel mostra os últimos eventos brutos com classificação do parser; retenção 50/empresa.
6. Suíte vitest completa verde (190 + novos).
7. Sem UAZAPI configurada, a Central continua utilizável (envio falha com erro claro 502 e a tela
   de config orienta; nada de crash).

## 10. Riscos & mitigações

- **Envelope do webhook divergente do assumido** → painel de eventos brutos captura na hora;
  ajuste concentrado em `parseUazapiEvent` (pura, testável). Mitigado, não eliminado.
- **QR/paircode variam por versão do servidor UAZAPI** → extração tolerante (`extractQr` já cobre
  5 formatos) + fixtures da spec.
- **Túnel muda de URL a cada sessão (cloudflared free)** → re-registro é 1 clique; runbook avisa.
- **Admin token vaza via logs** → nunca logar corpo de credenciais em server actions; `UazapiError`
  não inclui headers.
- **Mudança de assinatura do client quebra chamadas existentes** → TypeScript pega em build; suíte
  cobre webhook/send/send-media.
