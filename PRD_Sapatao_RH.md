# PRD — Plataforma Sapatão RH

**Cliente:** Estação Sapatão (Rede de Combustíveis)
**Produto:** Sapatão RH — Plataforma de Recrutamento, Atendimento e Gestão de Pessoas
**Versão:** 1.0
**Autor:** Lucas Webeer
**Data:** Junho de 2026
**Stack:** Next.js 14 (App Router) + Supabase + UAZAPI + LLM (a definir provider)

---

## 1. Sumário Executivo

A Estação Sapatão hoje recebe **98% dos currículos via WhatsApp**, com triagem 100% manual, planilhas paralelas, indicadores de RH extraídos mês a mês de PDFs do portal Onville, e nenhum sistema único que conecte atendimento, funil de candidatos, análise de aderência e base de funcionários ativos.

O Sapatão RH é a plataforma que unifica esses processos em um único produto web, com:

1. **Central de Atendimento WhatsApp** estilo WhatsApp Web (via UAZAPI).
2. **Funil Kanban de Recrutamento e Seleção** com etapas configuráveis. Incluindo Funil, e kanbans
3. **IA proprietária** treinada nos critérios de cada vaga, capaz de analisar currículos enviados no chat com um clique e devolver um score + parecer estruturado.
4. **Cadastro de Funcionários Ativos** como base mestre de pessoal. Login principal da empresa, e cadastro interno de usuarios na aba de configurações > acessos, onde o gestor cria o usuario e senha, e da os niveis de acesso
5. **Indicadores de RH** (turnover, absenteísmo, tempo médio de contratação, taxa de show-up).
6. **Configurações** (IA, integrações, critérios por vaga, usuários, unidades).

**Objetivo de negócio:** reduzir o tempo médio de triagem em ≥ 70%, aumentar a taxa de conversão candidato→entrevista, e dar ao RH visibilidade quantitativa sobre seu próprio processo.

---

## 2. Visão de Produto

> **Visão:** Ser o sistema operacional do RH da Estação Sapatão — onde todo candidato, mensagem, análise, contratação e indicador acontece em um só lugar, com IA agindo como copiloto de triagem.

> **Princípios de produto:**
> - **Chat como ponto de entrada.** O WhatsApp é o canal real, então a UX da plataforma respeita isso.
> - **IA não decide, IA acelera.** A LLM dá score e parecer; humano valida.
> - **Configurabilidade > Rigidez.** Critérios, etapas e indicadores são editáveis pelo próprio RH.
> - **Multi-unidade nativo.** Novo Hamburgo e Estância Velha desde o dia um, com possibilidade de novas unidades.

---

## 3. Objetivos e Métricas de Sucesso

### 3.1 Objetivos de Negócio

| # | Objetivo | KPI | Meta (6 meses pós-lançamento) |
|---|----------|-----|-------------------------------|
| O1 | Reduzir tempo manual de triagem | Tempo médio de triagem por candidato | ≤ 2 min (hoje: ~15 min) |
| O2 | Aumentar throughput de processo seletivo | Candidatos triados / semana | +200% |
| O3 | Reduzir no-show em entrevistas | Taxa de comparecimento | ≥ 75% (com lembrete automático) |
| O4 | Centralizar histórico de candidatos | % de candidatos com ficha completa | ≥ 95% |
| O5 | Dar visibilidade aos indicadores de RH | Indicadores atualizados em tempo real | Dashboard ativo |

### 3.2 Métricas de Produto

- **Adoção:** % de mensagens recebidas no UAZAPI que viram cards no funil.
- **Engajamento IA:** % de currículos com "Analisar Currículo" acionado.
- **Acurácia percebida da IA:** % de pareceres marcados como "úteis" pelo recrutador.
- **Velocidade de funil:** Tempo médio entre "Novo Lead" e "Contratado".

---

## 4. Stakeholders e Personas

### 4.1 Stakeholders

- **Sponsor:** Samuel Führ (Gestor / família proprietária).
- **Usuário primário:** Equipe de RH da Estação Sapatão.
- **Usuário secundário:** Gestores de unidade (validam candidatos finalistas).
- **Operação técnica:** NEXXA AI (construção, manutenção, evolução).

### 4.2 Personas

**Persona 1 — Recrutador(a) de RH**
- Recebe ~50–100 currículos por semana via WhatsApp.
- Hoje copia-cola informação em planilha, lê cada currículo manualmente.
- Precisa: triagem rápida, fila visual, lembretes de follow-up, agendamento.
- Dor: "Não consigo lembrar quem já respondi e quem ainda não."

**Persona 2 — Gestor de Unidade**
- Aprova/recusa finalistas, define a vaga.
- Precisa: ver shortlist com parecer da IA e currículo anexado.
- Não vai usar a plataforma diariamente — UX precisa ser óbvia.

**Persona 3 — Administrador / TI (NEXXA AI)**
- Configura integrações, chave de API da LLM, sessão do UAZAPI, critérios por vaga.
- Precisa: tudo configurável por interface, sem editar código.

---

## 5. Escopo

### 5.1 Dentro do Escopo (v1.0)

- Autenticação multi-usuário com roles.
- Multi-tenancy por unidade (Novo Hamburgo, Estância Velha, expansível).
- Central de Atendimento WhatsApp (1:1, estilo WhatsApp Web).
- Funil Kanban configurável de R&S.
- Análise de currículo por IA (botão no chat).
- Cadastro de funcionários ativos.
- Dashboard de indicadores de RH (turnover, absenteísmo, tempo de contratação, no-show).
- Configurações (IA, UAZAPI, critérios por vaga, usuários, unidades).
- Agendamento de entrevistas + lembrete automático (D-1).

### 5.2 Fora do Escopo (v1.0 — backlog futuro)

- Folha de pagamento / integração com ERP contábil.
- App mobile nativo (a plataforma será responsiva).
- Onboarding pós-contratação (digital signing, treinamentos).
- Avaliação de desempenho contínua.
- Portal do candidato (área externa de cadastro).
- Integração automática com PDF da Onville (entra em v1.1).

---

## 6. Arquitetura Técnica

### 6.1 Stack

| Camada | Tecnologia | Justificativa |
|--------|------------|---------------|
| Frontend | Next.js 14 (App Router) + React 18 + TypeScript | SSR/RSC, performance, ecossistema robusto |
| Estilização | TailwindCSS 4 + Radix UI + shadcn/ui | Design system rápido e consistente |
| Estado | Zustand + TanStack Query | Estado global leve + cache server-state |
| Backend / DB | Supabase (PostgreSQL + Auth + Storage + Realtime) | RLS, realtime para chat, storage para currículos |
| Integração WhatsApp | UAZAPI (webhook + REST) | Definido pelo cliente |
| IA | Provider configurável (Anthropic / OpenAI) via chave do cliente | Multi-provider para resiliência |
| Background Jobs | Edge Functions Supabase + Cron | Lembretes D-1, processamento de currículos |
| Observabilidade | Logflare + Sentry | Erros e logs estruturados |
| Hospedagem | Vercel (frontend) + Supabase (backend) | Deploy contínuo, baixa fricção |

### 6.2 Diagrama de Alto Nível

```
                ┌──────────────────────────┐
                │      Candidato            │
                │   (WhatsApp pessoal)      │
                └────────────┬─────────────┘
                             │
                             ▼
                ┌──────────────────────────┐
                │         UAZAPI            │
                │  (Sessão / Webhook)       │
                └────────────┬─────────────┘
                             │ webhook
                             ▼
            ┌────────────────────────────────────┐
            │  Next.js API Route /webhooks/uazapi│
            │  • Normaliza mensagem               │
            │  • Cria/atualiza Conversation       │
            │  • Cria/atualiza Candidate          │
            │  • Emite Realtime → Frontend        │
            └─────┬──────────────────────────┬───┘
                  │                          │
                  ▼                          ▼
        ┌──────────────────┐      ┌──────────────────────┐
        │    Supabase DB   │      │  Supabase Realtime    │
        │ (Postgres + RLS) │      │  (chat ao vivo)       │
        └──────────────────┘      └──────────┬───────────┘
                  ▲                          │
                  │                          ▼
                  │                ┌──────────────────────┐
                  │                │   Next.js Frontend    │
                  │                │  • Chat ao vivo       │
                  │                │  • Kanban             │
                  │                │  • Dashboards         │
                  │                └──────────┬───────────┘
                  │                           │
                  │                           ▼
                  │                ┌──────────────────────┐
                  │                │  /api/cv/analyze      │
                  │                │  (Analisar Currículo) │
                  │                └──────────┬───────────┘
                  │                           │
                  │                           ▼
                  │                ┌──────────────────────┐
                  └────────────────│   LLM Provider        │
                                   │ (chave do cliente)    │
                                   └──────────────────────┘
```

---

## 7. Módulos Funcionais

### 7.1 Autenticação & Autorização

**Funcionalidades:**
- Login por e-mail + senha (Supabase Auth).
- Convite por e-mail para novos usuários (admin envia).
- Roles: `admin`, `rh`, `gestor_unidade`, `viewer`.
- RLS no Postgres garante isolamento por unidade e por role.

**Regras:**
- `admin`: tudo (inclusive configurações e integrações).
- `rh`: chat, kanban, candidatos, funcionários, dashboard.
- `gestor_unidade`: visualiza apenas sua(s) unidade(s), pode mover cards na etapa "Aprovação Gestor".
- `viewer`: dashboard apenas.

### 7.2 Dashboard (Home)

**Widgets v1.0:**
- Funil ativo (cards por etapa, totais)
- Tempo médio de fechamento de vaga (7d/30d/90d)
- Taxa de no-show em entrevistas
- Turnover (mensal)
- Absenteísmo (mensal)
- Vagas abertas por unidade
- Últimas conversas sem resposta

**Filtros globais:** Unidade, Período, Vaga.

### 7.3 Central de Atendimento (Chat WhatsApp)

Layout estilo WhatsApp Web — 3 colunas:

```
┌─────────────┬──────────────────────────────┬─────────────┐
│   Lista     │       Conversa ativa          │  Painel     │
│   de        │                               │  Candidato  │
│   conversas │   [mensagens em bolhas]       │             │
│             │                               │  • Dados    │
│   • João    │   [Mensagem com anexo PDF]    │  • Vaga     │
│   • Maria   │   ↳ [Botão: Analisar          │  • Score IA │
│   • Pedro   │      Currículo]                │  • Tags     │
│             │                               │  • Notas    │
│             │   [campo de digitação]        │  • Histórico│
└─────────────┴──────────────────────────────┴─────────────┘
```

**Funcionalidades:**
- Recebimento em tempo real (Supabase Realtime + webhook UAZAPI).
- Envio de texto, mídia (imagem, áudio, documento).
- Indicadores: digitando, entregue, visto.
- Atribuição de conversa a um recrutador (claim).
- Status da conversa: `aberta`, `em atendimento`, `arquivada`.
- Tags rápidas: `Vaga: Frentista`, `Vaga: Caixa`, etc.
- **Quando uma mensagem contém anexo (PDF/DOC/DOCX):** botão **"Analisar Currículo"** aparece na própria mensagem.
- Busca por nome, telefone, conteúdo.
- Templates de mensagem (perguntas de filtro inicial — idade, distância, locomoção).

**Filtros de Triagem Automatizada (perguntas-filtro):**
- Templates configuráveis em `Configurações > Templates de Mensagem`.
- Sequência padrão sugerida: Idade ≥18 → CEP → Tem veículo próprio? → Vaga de interesse → Pede currículo.
- Respostas podem auto-popular o card no Kanban.

### 7.4 Recrutamento & Seleção (Kanban)

**Etapas padrão (configuráveis):**

1. **Novo Lead** — entrou pelo WhatsApp, sem triagem.
2. **Triagem Inicial** — passou pelos filtros básicos.
3. **Currículo Recebido** — anexo recebido, IA pode analisar.
4. **Análise IA Concluída** — IA gerou score.
5. **Apto p/ Entrevista** — RH validou.
6. **Entrevista Agendada** — data marcada.
7. **Aprovado p/ Gestor** — aguardando aprovação da unidade.
8. **Contratado** — virou funcionário (move para "Funcionários").
9. **Reprovado** — fim de jornada (arquivado).
10. **Desistente** — não respondeu / cancelou.

**Card do Candidato (mini):**
- Foto/avatar (do WhatsApp)
- Nome
- Vaga de interesse
- Unidade
- Score IA (0–100) com cor (vermelho/amarelo/verde)
- Tempo na etapa atual
- Tags
- Indicador "última atividade"

**Card expandido (modal):**
- Dados pessoais (nome, telefone, CEP, idade, distância calculada)
- Histórico da conversa (link → abre chat)
- Currículo anexado (preview)
- Parecer da IA (estruturado)
- Notas internas do recrutador
- Histórico de etapas (auditoria)
- Botões: Agendar Entrevista, Marcar como Reprovado, Enviar Mensagem

**Drag-and-drop entre etapas** com confirmação para etapas críticas (Contratado, Reprovado).

**Múltiplos funis:** um por tipo de vaga (Frentista, Caixa, Cozinha, Atendente, Customizado).

### 7.5 Análise de Currículo por IA

**Trigger:** botão "Analisar Currículo" em mensagem com anexo.

**Fluxo:**
1. Frontend envia `cv_message_id` para `/api/cv/analyze`.
2. Backend baixa o anexo via UAZAPI → salva no Supabase Storage.
3. Extrai texto (PDF, DOCX, DOC — usar `pdf-parse`, `mammoth`, fallback OCR via Tesseract para imagens).
4. Carrega o **prompt da vaga** (de `vaga_settings`).
5. Envia ao provider de LLM (chave do cliente vinda de `integrations`).
6. Recebe JSON estruturado:

```json
{
  "score": 78,
  "verdict": "apto",
  "criterios_atendidos": [
    {"criterio": "Idade ≥18", "atendido": true, "evidencia": "Data de nascimento 1998"},
    {"criterio": "Reside em até 17min", "atendido": true, "evidencia": "Bairro Roselândia"},
    {"criterio": "Veículo próprio", "atendido": false, "evidencia": "Não mencionado"}
  ],
  "pontos_fortes": ["Experiência em atendimento ao público", "Disponibilidade de horário"],
  "pontos_atencao": ["Sem veículo próprio mencionado"],
  "experiencia_relevante": "2 anos em loja de conveniência",
  "resumo": "Candidato apto para vaga de Atendente. Pendência: confirmar locomoção.",
  "perguntas_sugeridas_entrevista": [
    "Como você se desloca atualmente?",
    "Qual sua experiência com sistemas de PDV?"
  ]
}
```

7. Atualiza card do candidato com score, parecer e move automaticamente para "Análise IA Concluída".
8. Notifica recrutador (toast + badge).

**Critérios de aceitação:**
- Tempo de análise ≤ 30s (p95).
- Suporta PDF, DOCX, DOC, imagens (OCR).
- Falha graciosamente se LLM não responde (mostra erro acionável).

**Custo:** cada análise consome tokens da chave do cliente — exibir contador estimado em `Configurações > IA`.

### 7.6 Cadastro de Funcionários

**Funcionalidades:**
- Lista paginada de funcionários ativos/inativos.
- Filtros: unidade, cargo, data de admissão.
- Cadastro manual ou via promoção de candidato "Contratado".

**Campos:**
- Dados pessoais (nome completo, CPF, RG, data de nascimento, telefone, e-mail, CEP, endereço)
- Dados profissionais (cargo, unidade, data de admissão, salário, jornada, status)
- Documentos (upload de carteira, comprovante de residência, etc.)
- Histórico (avaliações, ocorrências — campo livre v1.0)

**Ações:**
- Editar
- Inativar (com motivo)
- Exportar lista (CSV)

### 7.7 Indicadores de RH

**Indicadores v1.0:**

| Indicador | Fonte | Cálculo |
|-----------|-------|---------|
| Turnover mensal | `funcionarios.desligamentos / headcount médio` | (Desligados ÷ Headcount Médio) × 100 |
| Absenteísmo | Manual (campo de ocorrências) v1.0 | Faltas ÷ Dias úteis |
| Tempo médio de contratação | `vagas` + `kanban_history` | Média de dias entre "Vaga Aberta" e "Contratado" |
| Taxa de no-show | `entrevistas` | (No-show ÷ Total agendadas) × 100 |
| Conversão por etapa | `kanban_history` | % que avança de cada etapa |
| Headcount por unidade | `funcionarios` | Count por `unidade_id` |

**Visualização:** cards numéricos + gráficos (Recharts).

**v1.1 (backlog):** ingestão automática de PDFs da Onville para auto-popular headcount e folha.

### 7.8 Configurações

#### 7.8.1 Geral
- Logo da empresa, nome, unidades cadastradas, horários.

#### 7.8.2 Usuários
- Listar, convidar, editar role, desativar.

#### 7.8.3 Vagas e Critérios
- Cadastrar vagas (Frentista, Caixa, Atendente, Cozinha, Customizada).
- Para cada vaga, definir:
  - **Critérios eliminatórios** (texto livre + regras estruturadas)
  - **Critérios desejáveis**
  - **Pontos de sucesso** (o que aumenta score)
  - **Pontos de baixa probabilidade** (o que reduz score)
  - **Prompt customizado para IA** (auto-gerado a partir dos critérios + editável)

**Exemplo pré-preenchido — Frentista:**

```yaml
vaga: Frentista
eliminatorios:
  - Idade mínima 18 anos
  - Residência com deslocamento ≤17min da unidade
  - Possui meio de deslocamento (preferencialmente veículo próprio)
desejaveis:
  - Experiência prévia em atendimento
observacoes:
  - "Não eliminar por pouca estabilidade profissional"
  - "Não é necessária experiência prévia"
```

#### 7.8.4 Integrações
- **UAZAPI:** URL da instância, token, número da sessão, status da conexão.
- **IA:** provider (Anthropic / OpenAI), chave de API, modelo padrão, limite mensal de tokens.
- **Calendário:** (v1.1) Google Calendar para agendamentos.

#### 7.8.5 Templates de Mensagem
- CRUD de templates com variáveis (`{{nome}}`, `{{vaga}}`, `{{data_entrevista}}`).
- Categorias: Filtro Inicial, Solicitação de Currículo, Convite Entrevista, Lembrete D-1, Resultado.

#### 7.8.6 Funil
- Editar etapas (adicionar, remover, renomear, reordenar).
- Definir cor por etapa.
- Definir SLAs por etapa (alerta se card ficar parado X dias).

---

## 8. Modelo de Dados (Supabase / Postgres)

> Esquema sugerido — refinar durante implementação. Todas as tabelas com `created_at`, `updated_at`, e RLS habilitado.

```sql
-- Tenancy
create table unidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cidade text,
  endereco text,
  ativa boolean default true
);

-- Auth (Supabase Auth gerencia auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  nome text,
  role text check (role in ('admin','rh','gestor_unidade','viewer')),
  unidades_acesso uuid[] -- IDs de unidades permitidas
);

-- Vagas
create table vagas (
  id uuid primary key default gen_random_uuid(),
  nome text not null, -- "Frentista", "Caixa"
  unidade_id uuid references unidades,
  status text default 'aberta', -- aberta, pausada, fechada
  criterios_eliminatorios jsonb,
  criterios_desejaveis jsonb,
  pontos_sucesso jsonb,
  pontos_baixa_probabilidade jsonb,
  prompt_ia text, -- prompt customizado da IA
  funil_id uuid references funis
);

-- Funis (Kanban configurável)
create table funis (
  id uuid primary key default gen_random_uuid(),
  nome text,
  ordem int
);

create table funil_etapas (
  id uuid primary key default gen_random_uuid(),
  funil_id uuid references funis on delete cascade,
  nome text,
  ordem int,
  cor text,
  sla_dias int -- alerta se passar disso
);

-- Candidatos
create table candidatos (
  id uuid primary key default gen_random_uuid(),
  nome text,
  telefone text unique, -- chave para mensagens UAZAPI
  cpf text,
  cep text,
  idade int,
  endereco text,
  tem_veiculo boolean,
  vaga_interesse uuid references vagas,
  unidade_id uuid references unidades,
  etapa_atual uuid references funil_etapas,
  score_ia int,
  parecer_ia jsonb,
  curriculo_url text, -- Supabase Storage
  curriculo_texto text, -- extraído
  tags text[],
  notas_internas text,
  atribuido_a uuid references profiles,
  status text default 'ativo' -- ativo, contratado, reprovado, desistente
);

-- Histórico de movimentação no funil (auditoria)
create table kanban_history (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references candidatos on delete cascade,
  de_etapa uuid references funil_etapas,
  para_etapa uuid references funil_etapas,
  movido_por uuid references profiles,
  movido_em timestamptz default now(),
  observacao text
);

-- Conversas
create table conversations (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references candidatos,
  telefone text,
  ultima_mensagem_em timestamptz,
  status text default 'aberta', -- aberta, em_atendimento, arquivada
  atribuida_a uuid references profiles,
  uazapi_chat_id text
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations on delete cascade,
  uazapi_message_id text unique,
  direcao text check (direcao in ('in','out')),
  tipo text, -- text, image, audio, document
  conteudo text,
  midia_url text,
  midia_mime text,
  metadata jsonb,
  enviada_em timestamptz default now(),
  lida_em timestamptz
);

-- Entrevistas
create table entrevistas (
  id uuid primary key default gen_random_uuid(),
  candidato_id uuid references candidatos,
  vaga_id uuid references vagas,
  agendada_para timestamptz,
  duracao_min int default 30,
  status text default 'agendada', -- agendada, realizada, no_show, cancelada
  agendada_por uuid references profiles,
  lembrete_enviado_em timestamptz,
  observacoes text
);

-- Funcionários
create table funcionarios (
  id uuid primary key default gen_random_uuid(),
  candidato_origem_id uuid references candidatos, -- se veio do funil
  nome_completo text not null,
  cpf text unique,
  rg text,
  data_nascimento date,
  telefone text,
  email text,
  cep text,
  endereco text,
  cargo text,
  unidade_id uuid references unidades,
  data_admissao date,
  data_demissao date,
  salario numeric(10,2),
  jornada text, -- "44h semanais", etc
  status text default 'ativo' -- ativo, inativo, afastado
);

create table funcionario_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  funcionario_id uuid references funcionarios on delete cascade,
  tipo text, -- falta, atestado, advertencia, elogio
  data date,
  observacao text,
  registrado_por uuid references profiles
);

-- Integrações
create table integrations (
  id uuid primary key default gen_random_uuid(),
  tipo text, -- 'uazapi', 'llm', 'calendar'
  config jsonb, -- chave criptografada via pgsodium
  ativa boolean default true,
  atualizado_em timestamptz default now()
);

-- Templates de mensagem
create table message_templates (
  id uuid primary key default gen_random_uuid(),
  nome text,
  categoria text, -- filtro_inicial, solicitar_curriculo, convite_entrevista, lembrete, resultado
  conteudo text, -- com {{variaveis}}
  variaveis text[],
  ativo boolean default true
);
```

**Storage Buckets:**
- `curriculos/` — currículos recebidos, acesso via signed URLs.
- `documentos_funcionarios/` — privado, apenas admin/rh.
- `midia_chat/` — anexos enviados/recebidos no chat.

**RLS (exemplos):**
- `candidatos`: usuário só vê candidatos das `unidades_acesso` do seu profile.
- `funcionarios`: idem.
- `messages`: idem via join com `conversations.candidatos.unidade_id`.

---

## 9. Fluxos Críticos

### 9.1 Candidato → Card no Funil

1. Candidato manda mensagem no WhatsApp.
2. UAZAPI dispara webhook → `/api/webhooks/uazapi`.
3. Backend:
   - Verifica se `telefone` já existe em `candidatos`. Se não, cria com status "novo lead".
   - Cria/atualiza `conversation`.
   - Insere `message`.
   - Emite Realtime → chat atualiza ao vivo.
4. Card aparece na coluna "Novo Lead" do funil (sem vaga ainda).

### 9.2 Triagem Inicial via Templates

1. Recrutador abre conversa.
2. Clica em "Enviar template → Filtro Inicial".
3. Sistema envia sequência (idade → CEP → veículo → vaga).
4. Respostas auto-populam campos do candidato.
5. Sistema avalia regras eliminatórias da vaga (se idade <18 → sinaliza alerta vermelho no card).

### 9.3 Análise de Currículo

(Detalhado em 7.5)

### 9.4 Agendamento de Entrevista

1. Recrutador clica "Agendar Entrevista" no card.
2. Modal: data, hora, duração, observações.
3. Cria registro em `entrevistas`.
4. Move card para "Entrevista Agendada".
5. Envia mensagem WhatsApp com template "Convite Entrevista".
6. **Cron diário (00:00)** procura entrevistas no D+1 → envia template "Lembrete D-1".
7. No dia da entrevista, recrutador marca como "Realizada" / "No-show" / "Cancelada".

### 9.5 Contratação

1. Card movido para "Contratado".
2. Modal: confirmar dados, completar campos faltantes (CPF, RG, salário, data admissão).
3. Cria registro em `funcionarios` com `candidato_origem_id`.
4. Conversa do WhatsApp é arquivada (mas histórico preservado).

---

## 10. Integrações

### 10.1 UAZAPI

- **Configuração:** instância + token + número da sessão (em `integrations`).
- **Webhook único** em `/api/webhooks/uazapi` recebendo todos os eventos.
- **Eventos tratados v1.0:** `message.received`, `message.sent`, `message.read`, `connection.status`.
- **Envio:** wrapper service `lib/uazapi/client.ts` para `sendText`, `sendMedia`, `sendDocument`.
- **Resiliência:** retry com backoff, fila para falhas.

### 10.2 LLM (Anthropic / OpenAI)

- **Configuração:** provider + chave + modelo padrão em `integrations`.
- **Chave criptografada** com `pgsodium` no Supabase.
- **Service:** `lib/ai/analyzeResume.ts` recebe `{ texto_curriculo, prompt_vaga, criterios }` → retorna JSON estruturado.
- **Fallback:** se provider primário falha, tenta secundário (se configurado).

### 10.3 Onville (v1.1 — backlog)

- Upload manual de PDF mensal por enquanto.
- v1.1: parser que extrai headcount, folha, absenteísmo do PDF e alimenta indicadores.

---

## 11. Design System

### 11.1 Identidade Visual (extraída de estacaosapatao.com.br)

**Paleta principal (a confirmar via brand guidelines oficial — sugestão baseada no site):**

| Token | Cor | Uso |
|-------|-----|-----|
| `--sapatao-verde-principal` | `#1E4D2B` (verde escuro tradicional) | Sidebar, headers, botões primários |
| `--sapatao-verde-claro` | `#4A7C59` | Estados hover, badges sucesso |
| `--sapatao-laranja` | `#E85D2F` | Acentos, CTAs secundários, destaques |
| `--sapatao-amarelo-shell` | `#FFD500` | Tags Shell, status atenção |
| `--neutro-900` | `#0F1419` | Texto principal |
| `--neutro-700` | `#3D4852` | Texto secundário |
| `--neutro-200` | `#E8ECEF` | Borders, divisores |
| `--neutro-50` | `#FAFBFC` | Background app |
| `--branco` | `#FFFFFF` | Cards |

> **Ação:** validar paleta exata com Samuel Führ / acessar manual da marca. Cores acima são interpretação visual do site, não oficiais.

### 11.2 Tipografia

- **Display / Headers:** uma sans-serif com personalidade — sugestão: `Bricolage Grotesque` ou `Archivo` (similar ao tom institucional do site).
- **Body / UI:** `Inter` (legibilidade em tabelas e formulários).
- **Mono (códigos, IDs):** `JetBrains Mono`.

### 11.3 Componentes Base (shadcn/ui customizado)

- Button (primary/secondary/ghost/destructive)
- Input, Select, Textarea, DatePicker
- Card, Sheet, Dialog, Drawer
- Kanban Column / Card (custom)
- ChatBubble (custom — distinguir in/out)
- Avatar, Badge, Tag
- DataTable (TanStack Table)
- Toast (sonner)
- Empty State, Skeleton, Spinner

### 11.4 Tom e Linguagem

Tradicional + acolhedor (DNA Sapatão: "Um lugar para parar, ficar e voltar") + direto (é ferramenta de trabalho). Microcopy em PT-BR, voz ativa, sem juridiquês.

- ✅ "Mover candidato para Entrevista Agendada"
- ❌ "Deseja realizar a transição do candidato para o status de entrevista agendada?"

---

## 12. Estrutura de Pastas (Next.js)

```
sapatao-rh/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   └── convite/
│   ├── (app)/
│   │   ├── layout.tsx              # Sidebar + Topbar
│   │   ├── dashboard/
│   │   ├── chat/
│   │   │   └── [conversation_id]/
│   │   ├── funil/
│   │   │   └── [vaga_id]/
│   │   ├── candidatos/
│   │   │   └── [id]/
│   │   ├── funcionarios/
│   │   │   └── [id]/
│   │   ├── indicadores/
│   │   └── configuracoes/
│   │       ├── geral/
│   │       ├── usuarios/
│   │       ├── vagas/
│   │       ├── integracoes/
│   │       ├── templates/
│   │       └── funil/
│   └── api/
│       ├── webhooks/uazapi/
│       ├── cv/analyze/
│       ├── messages/send/
│       └── cron/lembretes/
├── components/
│   ├── ui/                  # shadcn/ui
│   ├── chat/
│   ├── kanban/
│   ├── dashboard/
│   └── forms/
├── lib/
│   ├── supabase/
│   ├── uazapi/
│   ├── ai/
│   ├── utils/
│   └── validations/         # Zod schemas
├── hooks/
├── stores/                  # Zustand
├── types/
└── public/
```

---

## 13. Roadmap por Fases

### Fase 0 — Setup (Semana 0)
- Repo, CI/CD, ambientes (dev, staging, prod).
- Supabase Project + schema inicial.
- Design tokens, shadcn/ui configurado.
- Auth + tela de login + convite.
- **Entrega:** usuário consegue logar.

### Fase 1 — Núcleo do Chat (Semanas 1–3)
- Integração UAZAPI (webhook + envio).
- Tela de chat 3-colunas funcional.
- CRUD básico de candidatos.
- Realtime em mensagens.
- **Entrega:** RH consegue receber e responder mensagens dentro da plataforma.

### Fase 2 — Funil Kanban (Semanas 4–5)
- Configuração de etapas.
- Cards drag-and-drop.
- Múltiplos funis por vaga.
- Histórico de movimentações.
- **Entrega:** triagem visual funcionando.

### Fase 3 — IA de Currículos (Semanas 6–7)
- Configuração de integrações (chave LLM).
- Botão "Analisar Currículo" no chat.
- Extração de texto (PDF/DOCX/imagem).
- Prompts por vaga + parecer estruturado.
- **Entrega:** análise automática reduzindo tempo de triagem.

### Fase 4 — Funcionários & Indicadores (Semanas 8–9)
- CRUD de funcionários.
- Promoção de candidato → funcionário.
- Dashboard com indicadores básicos.
- **Entrega:** visão completa do ciclo + KPIs.

### Fase 5 — Agendamento & Automação (Semanas 10–11)
- Agendamento de entrevistas.
- Templates de mensagem.
- Cron de lembretes D-1.
- **Entrega:** processo seletivo automatizado ponta-a-ponta.

### Fase 6 — Polimento & Go-Live (Semana 12)
- QA, testes de carga, ajustes de UX.
- Treinamento da equipe Sapatão.
- Migração de dados (se houver planilhas a importar).
- **Entrega:** produção.

### Pós-Lançamento (Backlog v1.1)
- Parser de PDFs Onville.
- Portal externo do candidato.
- Integração Google Calendar.
- App mobile / PWA dedicado.
- Avaliação de desempenho.

---

## 14. Critérios de Aceitação Globais

- Tempo de carregamento de qualquer página: **≤ 2s p95**.
- Mensagem do WhatsApp aparece no chat da plataforma em **≤ 3s** após chegar no UAZAPI.
- Análise de currículo retorna em **≤ 30s p95**.
- Sistema suporta **10 usuários simultâneos** sem degradação (v1.0).
- Cobertura de testes ≥ 60% em lógica de negócio.
- Acessibilidade básica: navegação por teclado, ARIA labels, contraste WCAG AA.
- Responsivo desktop-first, funcional em tablets (1024px+).

---

## 15. Riscos & Mitigações

| Risco | Probabilidade | Impacto | Mitigação |
|-------|---------------|---------|-----------|
| UAZAPI instável / queda de sessão | Média | Alto | Health check + alerta em tempo real + reconexão automática |
| LLM imprecisa em parecer | Média | Médio | Score sempre acompanhado de evidências verificáveis; humano valida |
| Chave de API exposta | Baixa | Crítico | Criptografia em repouso (pgsodium), nunca expor no frontend |
| Volume de currículos sobrecarregar storage | Baixa | Médio | Política de retenção (arquivar pós-90d), compressão |
| Adesão baixa do time de RH | Média | Alto | Treinamento ao vivo + onboarding guiado dentro do produto |
| Custos de LLM acima do previsto | Média | Médio | Limite mensal configurável + alerta de uso em Configurações |

---

## 16. Próximos Passos (Acionáveis)

1. **Validar PRD com Samuel Führ** — alinhar prioridades das fases.
2. **Acessar UAZAPI** — receber documentação técnica + credenciais.
3. **Validar paleta exata** — pedir manual da marca / arquivos de identidade visual.
4. **Decidir provider de LLM inicial** — Anthropic (Claude Haiku para custo, Sonnet para qualidade) vs OpenAI.
5. **Criar projeto Supabase** + setup inicial do schema.
6. **Repositório no GitHub** + CI/CD Vercel.
7. **Wireframes / Figma** das telas-chave (Chat, Kanban, Análise IA, Dashboard).
8. **Kickoff Fase 0** — semana 0.

---

## Apêndice A — Prompt-base da IA por Vaga

Template que será mesclado com critérios específicos de cada vaga:

```
Você é um analista de RH da Estação Sapatão, rede de combustíveis com 50+ anos de tradição. Sua tarefa é avaliar um currículo para a vaga de {VAGA}, na unidade {UNIDADE}.

Critérios eliminatórios (se algum não for atendido, marcar `verdict: "inapto"`):
{CRITERIOS_ELIMINATORIOS}

Critérios desejáveis (somam pontos no score, não eliminam):
{CRITERIOS_DESEJAVEIS}

Pontos de sucesso (aumentam score significativamente):
{PONTOS_SUCESSO}

Pontos de baixa probabilidade (reduzem score, sem eliminar):
{PONTOS_BAIXA_PROBABILIDADE}

Regras de avaliação:
- Score de 0 a 100.
- Se algum eliminatório falhar, score máximo é 30 e verdict = "inapto".
- Não eliminar por pouca estabilidade profissional.
- Sempre justificar com evidência textual do currículo.
- Se informação está ausente, marcar como "não informado" — NÃO inventar.

Currículo a analisar:
---
{TEXTO_CURRICULO}
---

Responda em JSON estrito seguindo o schema:
{SCHEMA_JSON}
```

---

## Apêndice B — Glossário

- **UAZAPI:** API não-oficial de WhatsApp usada pelo cliente.
- **RLS (Row Level Security):** isolamento por linha no Postgres.
- **Funil Kanban:** visualização de etapas do processo seletivo.
- **Score IA:** nota de 0–100 atribuída pela LLM.
- **No-show:** candidato que não comparece à entrevista.
- **Etapa:** coluna do Kanban.
- **Vaga:** posição aberta (Frentista, Caixa, etc.).

---

**Fim do PRD v1.0**
