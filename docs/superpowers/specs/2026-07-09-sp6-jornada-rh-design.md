# SP6 — Jornada do RH: lead manual, conversa ativa, triagem no chat, filtros e notificações · Design / Spec

> Data: 2026-07-09 · Fatia: SP6
> Pré-requisitos: SP1 (Central), SP1d (UAZAPI ao vivo), SP2/SP2b (Funil), módulo Candidatos.
> Base de código: branch nova `feat/sp6-jornada-rh` criada do tip do módulo Candidatos
> (`feat/candidatos-modulo`) + merge de `feat/sp1d-uazapi-live` (correções do parser/live).
> Implementação em worktree isolado (a sessão paralela segue em `feat/funcionarios`).

## 1. Contexto e objetivo

Hoje o lead SÓ nasce quando manda WhatsApp (webhook → `upsertCandidato`); o RH não consegue
cadastrar um candidato de indicação/presencial nem iniciar uma conversa de WhatsApp; o painel
do candidato na Central é somente leitura (triagem exige trocar de tela); o Kanban não tem
filtros (o seletor de unidade da topbar grava num Zustand que ninguém lê); `message_templates`
existe no banco desde a SP1a mas nunca ganhou UI; e mensagem nova só é percebida dentro de
`/chat` (badge na lista). Campos `atribuido_a`, `tags`, `vaga_interesse`, `origem` existem no
schema sem UI de edição.

**Objetivo:** completar as duas jornadas da pessoa de RH —
(a) **inbound**: mensagem chega → notificação em qualquer tela → triagem completa sem sair do
chat (etapa, tags, vaga, responsável, dados) → filtros por dono/vaga/unidade no Kanban;
(b) **outbound**: cadastrar candidato manualmente → iniciar conversa de WhatsApp com template
de saudação pré-preenchido → conversa segue o fluxo normal da Central.

## 2. Decisões adotadas (com o usuário, 2026-07-09)

- Escopo: os 4 blocos juntos nesta fatia (lead manual+conversa ativa; painel de ação; filtros;
  notificações).
- 1ª mensagem de conversa ativa: **template sugerido pré-preenchido, texto livre permitido**
  (rejeitado: template obrigatório; texto livre sem template).
- Vagas: **texto livre editável + autocomplete** das vagas já usadas na empresa (rejeitado por
  ora: entidade Vagas — fica para fatia própria).
- Responsável: **atribuir + filtros "meus/minhas"** na Central e no Kanban.
- Atribuição mora em `candidatos.atribuido_a` (fonte única). `conversations.atribuida_a`
  permanece sem uso (documentado aqui; remover em limpeza futura).
- Notificações: badge global na sidebar + toast fora da conversa aberta + som **opcional**
  (toggle por dispositivo, localStorage). Rejeitado: Notification API do navegador.
- **Sem migration nova** — tudo usa colunas/tabelas existentes.

## 3. Ações de dados (server actions, RLS)

Novas actions em `app/(app)/candidatos/actions.ts` (novo arquivo; RLS client; roles
`admin`/`rh` — mesma guarda de `moverCandidatoAction`):

- `criarCandidato(input)` — Zod: `nome` min 2, `telefone` normalizado (só dígitos, 10-15),
  `vaga_interesse?`, `unidade_id?`, `origem` (`indicacao|presencial|site|whatsapp|outro`,
  default `outro`), `tags?: string[]`. Insere com `status='ativo'`; o trigger BEFORE INSERT
  existente (0010) já posiciona na 1ª etapa do funil padrão. Telefone duplicado (unique
  `empresa_id+telefone`, erro 23505) → retorna `{ error: "telefone_existente", candidatoId }`
  para a UI oferecer "abrir ficha".
- `atualizarCandidato(id, patch)` — Zod parcial: `nome`, `idade`, `cep`, `endereco`,
  `tem_veiculo`, `vaga_interesse`, `tags`, `atribuido_a` (uuid de profile da empresa ou null),
  `telefone` (**só aceito se o candidato não tem conversa** — checagem server-side; UI trava o
  campo com tooltip "telefone é a identidade do WhatsApp após a 1ª conversa").
- `iniciarConversa(candidatoId)` — cria a conversation (tratamento 23505 = já existe → retorna
  a existente), retorna `{ conversationId }`. NÃO envia mensagem — o envio é o fluxo normal do
  composer.
- `listarVagasSugeridas()` — `select distinct vaga_interesse` não-nulas da empresa (para os
  autocompletes). Pode ser query no server component em vez de action.
- `listarResponsaveis()` — profiles ativos da empresa com role admin/rh (para os selects).

Templates (`app/(app)/configuracoes/templates/actions.ts`): CRUD de `message_templates`
(criar/editar/ativar-desativar/excluir) — admin-only, mesmo padrão do Config>Funil.
Substituição de variáveis: função pura `preencherTemplate(conteudo, { nome, vaga, unidade })`
em `lib/whatsapp/templates.ts` — `{{nome}}` → primeiro nome do candidato, `{{vaga}}`,
`{{unidade}}`; variável sem valor vira string vazia (nunca deixa `{{...}}` no texto).

## 4. Bloco A — Lead manual + conversa ativa

- **`NovoCandidatoDialog`** (`components/candidatos/novo-candidato-dialog.tsx`): campos da
  action `criarCandidato`; vaga com `<datalist>`/combobox das sugestões; abre de 2 lugares:
  botão "Novo candidato" no header de `/candidatos` e no header do `/funil`. Sucesso → toast +
  navega para a ficha (em `/candidatos`) ou refresh do board (em `/funil`). Duplicado → alerta
  inline com link "Abrir ficha existente".
- **Iniciar conversa**: nos 3 pontos onde hoje "Abrir conversa" fica desabilitada sem conversa
  (ficha `ficha-acoes.tsx`, modal do funil `candidate-modal.tsx`) o botão vira **"Iniciar
  conversa"** → `iniciarConversa` → navega `/chat?c={id}&tpl=saudacao`. Na Central, botão
  **"Nova conversa"** no header da lista → dialog com busca de candidato (nome/telefone; usa a
  busca da lista de candidatos) + atalho "cadastrar novo" (abre o `NovoCandidatoDialog` e
  emenda o fluxo).
- **Prefill do composer**: `/chat` aceita `?tpl={categoria}`; o composer, ao montar com `tpl` e
  campo vazio, carrega o template ativo daquela categoria (preferindo categoria `saudacao`),
  aplica `preencherTemplate` com os dados do candidato da conversa e preenche o textarea
  (editável; enviar segue o fluxo otimista normal). Sem template cadastrado → composer vazio
  (sem erro).
- **Picker de templates** no composer: botão (ícone) abre popover com os templates ativos
  agrupados por categoria; clique insere o conteúdo preenchido no textarea (substitui o texto
  atual se vazio; senão anexa ao final).
- **Config > Templates** (`/configuracoes/templates`, admin): lista + dialog criar/editar
  (nome, categoria, conteúdo com hint das variáveis, ativo). Entra no `SettingsNav`.

## 5. Bloco B — Painel de ação no chat (+ ficha)

`components/chat/candidate-panel.tsx` deixa de ser somente leitura (mantém o visual editorial):

- **Etapa do funil**: select com as etapas do funil do candidato (mesma fonte do modal do
  funil), com confirmação nas etapas `requires_confirm`/terminais; chama
  `moverCandidatoAction` existente. (Substitui o campo-texto legado `etapa` exibido hoje.)
- **Tags**: chips com “x” para remover + input para adicionar (Enter) → `atualizarCandidato`.
- **Vaga**: input com autocomplete (sugestões) → `atualizarCandidato`.
- **Responsável**: select de responsáveis (+ “Ninguém”) → `atualizarCandidato`.
- **"Editar dados"**: dialog compartilhado `EditarCandidatoDialog`
  (`components/candidatos/editar-candidato-dialog.tsx`) com nome, idade, CEP, endereço,
  veículo, telefone (travado quando há conversa).
- **"Ver no funil"**: link para `/funil` (sem highlight nesta fatia — YAGNI).
- **Ficha `/candidatos/[id]`** ganha os mesmos poderes: botão "Editar dados" (mesmo dialog) +
  tags/vaga/responsável editáveis na seção de dados pessoais.

## 6. Bloco C — Filtros

- **Kanban** (`/funil`): `FunilFiltros` (client, URL-driven como `filtros-bar.tsx` dos
  candidatos): busca `?q=` (nome/telefone, debounce), vaga `?vaga=`, responsável `?resp=`
  (com opção "Meus"), unidade `?u=`. Filtro aplicado **no servidor** (`listCandidatosDoFunil`
  ganha os parâmetros; a assinatura atual já recebe `unidadeId`). Board e contadores refletem
  o conjunto filtrado. O seletor de unidade da **topbar** passa a escrever `?u=` na URL atual
  (e o Zustand morre ou vira espelho da URL — decisão: escreve na URL, remove o store).
- **Central** (`/chat`): chips acima da lista — **Todas / Não lidas / Minhas** (`?f=nao-lidas`
  | `?f=minhas`). "Não lidas" = `unread_count > 0` (filtro client-side sobre a lista já
  carregada, como a busca atual); "Minhas" = candidato.atribuido_a = usuário logado (o
  `listConversations` passa a trazer `atribuido_a` do candidato).

## 7. Bloco D — Notificações

- **`UnreadBadge`** na sidebar (item Atendimento): componente client montado no shell,
  subscribe realtime de `conversations` (empresa) somando `unread_count`; atualiza em
  qualquer tela. Padrão de channel com flag `cancelled` (gotcha Strict Mode do projeto).
- **Toast global de mensagem nova**: no mesmo componente/provider do shell, subscribe de
  INSERT em `messages` com `direction='inbound'`; mostra toast "Nome: preview" com ação
  "Abrir" → `/chat?c=...`. Supressão: se já estamos em `/chat` com essa conversa aberta
  (`?c=` igual), não mostra.
- **Som opcional**: toggle 🔔/🔕 no header da Central, persistido em
  `localStorage("sapatao.som-notificacao")`; quando ligado, o toast global também toca um
  beep curto (WebAudio oscillator — sem asset de áudio). Default: desligado.

## 8. Fora de escopo (fatias futuras)

- Entidade/módulo **Vagas** (cadastro, status, vínculo funil) — próxima fatia natural.
- Atribuição por conversa (`conversations.atribuida_a`) e fila/roteamento de atendimento.
- Notification API do navegador; contadores por etapa filtrada no Kanban persistidos.
- Editar telefone de candidato COM conversa (migração de identidade WhatsApp).
- Importação em massa de candidatos (CSV).

## 9. Critérios de aceitação

1. RH cadastra candidato manual (2 lugares) e ele aparece na 1ª etapa do funil; telefone
   duplicado oferece link para a ficha existente.
2. De ficha/modal/Central, RH inicia conversa com candidato sem conversa; composer abre com
   template de saudação preenchido (`{{nome}}` resolvido) e editável; envio real funciona.
3. Picker de templates insere conteúdo preenchido; Config>Templates faz CRUD (admin).
4. No painel do chat: mover etapa (com confirmação nas críticas), tags, vaga, responsável e
   dados básicos editáveis; telefone travado quando há conversa; "Ver no funil" navega.
5. Kanban filtra por busca/vaga/responsável/“meus”/unidade via URL; seletor da topbar filtra
   de verdade; board e contadores refletem o filtro.
6. Central filtra Todas/Não lidas/Minhas; badge global na sidebar mostra não-lidas de
   qualquer tela; toast aparece fora da conversa aberta; som toca só com toggle ligado.
7. Suíte inteira verde (222+ novos); nenhuma regressão no fluxo inbound existente
   (verify:sp1d segue passando).

## 10. Riscos & mitigações

- **Conflito com a sessão paralela (Funcionários)**: worktree isolado + branch própria; os
  arquivos que ambos tocam (`ficha`/`[id]/page.tsx`) podem conflitar no merge — mitigar
  criando componentes novos e edições pontuais; o merge final é decisão do usuário.
- **Telefone como identidade**: edição bloqueada com conversa existente (server-side, não só
  UI).
- **Realtime no shell** (badge/toast): reusar exatamente o padrão anti-StrictMode do projeto;
  1 channel compartilhado para não multiplicar conexões.
- **Template com variável sem dado** (ex.: sem vaga): `preencherTemplate` remove o placeholder
  — nunca envia `{{vaga}}` cru.
- **Filtros server-side no board** podem esconder cards recém-movidos se o filtro os excluir —
  comportamento esperado; toast de sucesso do move continua confirmando a ação.
