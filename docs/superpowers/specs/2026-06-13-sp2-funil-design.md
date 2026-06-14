# SP2 — Funil Kanban (Quadro) · Design / Spec

**Produto:** Sapatão RH · **Fatia:** SP2 (módulo Funil Kanban de R&S — Fase 2 do PRD)
**Data:** 2026-06-13 · **Status:** Aprovado para implementação
**Base:** SP0 + SP1 (Central de Atendimento) concluídas. PRD §7.4 (Kanban) e §8 (modelo de dados).

---

## 1. Contexto e objetivo

Os candidatos já chegam pelo WhatsApp (SP1) e viram registros. A SP2 dá ao RH a **visão de funil**: um quadro Kanban onde cada candidato é um card que avança por etapas configuráveis, com arrastar-e-soltar, histórico de movimentação e um modal de detalhes.

**Objetivo / demo:** abrir `/funil` → ver os candidatos distribuídos por etapas (Novo Lead → ... → Contratado/Reprovado); arrastar um card para outra etapa (com confirmação nas etapas críticas) → a mudança persiste, registra histórico, e atualiza em tempo real; clicar num card abre o modal com dados, notas e histórico.

> **Escopo:** este é o **quadro**. A **edição de etapas** (Configurações > Funil — adicionar/remover/renomear/reordenar/cor/SLA) e o vínculo **funil↔vaga** (que exige o módulo de Vagas) ficam para a **SP2b**. A SP2 já constrói a infraestrutura **multi-funil** (suporta vários funis) e seed de um funil padrão.

---

## 2. Decisões adotadas

| Decisão | Escolha |
|---------|---------|
| Multi-funil | Infra suporta N funis por empresa; SP2 **seeda 1 funil padrão** ("Recrutamento & Seleção") com as 10 etapas do PRD. Seletor de funil na UI. Vínculo funil↔vaga = SP2b/Vagas. |
| Etapa do candidato | Nova coluna `candidatos.etapa_id` (FK `funil_etapas`) + `etapa_entrou_em`. **Trigger** coloca todo candidato novo na 1ª etapa do funil padrão (desacopla do SP1); backfill dos existentes. |
| Drag-and-drop | **@dnd-kit** (`@dnd-kit/core` + `@dnd-kit/sortable`) — padrão moderno p/ kanban. |
| Mover etapa | Server action `moverCandidato` → atualiza `etapa_id`+`etapa_entrou_em` e insere `kanban_history`. Confirmação para etapas `requires_confirm` (Contratado, Reprovado). |
| Permissão | admin/rh movem cards (a nuance do `gestor_unidade` mover só em "Aprovação Gestor" fica para depois). |
| Realtime | Publicar `candidatos` no realtime; o quadro recarrega ao mover/criar. |
| Edição de etapas | **SP2b** (Configurações > Funil). |

---

## 3. Modelo de dados (migration 0010)

Padrão SP0/SP1: `empresa_id` + RLS, `update_updated_at`, índices. Helpers RLS reutilizados.

```sql
create table public.funis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  is_default boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index funis_empresa_idx on public.funis(empresa_id);
-- um funil padrão por empresa:
create unique index funis_one_default on public.funis(empresa_id) where is_default;

create table public.funil_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funil_id uuid not null references public.funis(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  cor text not null default '#4A7C59',
  sla_dias int,
  is_terminal boolean not null default false,     -- arquiva (Reprovado/Desistente/Contratado)
  requires_confirm boolean not null default false, -- pede confirmação no drag (Contratado/Reprovado)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index funil_etapas_funil_idx on public.funil_etapas(funil_id, ordem);

-- candidatos: etapa atual + quando entrou
alter table public.candidatos add column if not exists etapa_id uuid references public.funil_etapas(id) on delete set null;
alter table public.candidatos add column if not exists etapa_entrou_em timestamptz;
create index if not exists candidatos_etapa_idx on public.candidatos(etapa_id);

create table public.kanban_history (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  de_etapa uuid references public.funil_etapas(id) on delete set null,
  para_etapa uuid references public.funil_etapas(id) on delete set null,
  movido_por uuid references public.profiles(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now()
);
create index kanban_history_candidato_idx on public.kanban_history(candidato_id, created_at desc);
```

**Trigger de colocação automática** (`place_candidato_in_default_funil`): `before insert on candidatos`, se `new.etapa_id is null`, busca a 1ª etapa (menor `ordem`) do funil `is_default` da `new.empresa_id` e seta `new.etapa_id` + `new.etapa_entrou_em = now()`. (SECURITY DEFINER, search_path public.)

**RLS (0011):** habilitar nas 3 tabelas. `funis`/`funil_etapas`: select tenant; write admin (config é admin). `kanban_history`: select tenant; insert via app (admin/rh). `candidatos` já tem RLS (SP1) — o update de `etapa_id` cai na policy de write admin/rh existente.

**Realtime (0011):** `alter publication supabase_realtime add table public.candidatos;` (idempotente).

**Seed** (estender `seed.mjs`): para a empresa, criar (idempotente por nome) o funil "Recrutamento & Seleção" (`is_default=true`) e as 10 etapas (PRD §7.4) com ordem/cor/flags:
1. Novo Lead · 2. Triagem Inicial · 3. Currículo Recebido · 4. Análise IA Concluída · 5. Apto p/ Entrevista · 6. Entrevista Agendada · 7. Aprovado p/ Gestor · 8. Contratado *(terminal, confirm)* · 9. Reprovado *(terminal, confirm)* · 10. Desistente *(terminal, confirm)*.
Após criar, **backfill**: candidatos sem `etapa_id` → 1ª etapa (Novo Lead).

---

## 4. Quadro Kanban (`/funil`)

- Server page (`force-dynamic`): carrega o funil padrão (ou `?funil=<id>`), suas etapas (ordem), e os candidatos do funil agrupados por `etapa_id` (RLS-scoped; filtra por unidade selecionada se houver). Passa para um client board.
- **Seletor de funil** no topo (se houver >1) + contagem por etapa.
- **Colunas** = etapas (cor da etapa no topo, nome, contagem, alerta de SLA se `sla_dias` e card parado > SLA).
- **Card mini** (`components/funil/candidate-card.tsx`): avatar/inicial, nome, vaga_interesse, **score IA** (badge vermelho/amarelo/verde por faixa, placeholder se null), tempo na etapa (de `etapa_entrou_em`), tags, indicador de última atividade.
- **Drag-and-drop** (@dnd-kit): arrastar um card para outra coluna chama `moverCandidato`. Para etapa `requires_confirm`, abre um `Dialog` de confirmação antes de efetivar (Base UI). Otimista: o card move na hora; reconcilia via realtime/refresh; em erro, volta + toast.
- **Realtime** (`components/funil/realtime.tsx`): `setAuth` + subscription em `candidatos` filtrada por `empresa_id` → `router.refresh()`.

`moverCandidato(candidatoId, paraEtapaId, observacao?)` (server action, admin/rh, tenant guard): lê a etapa atual, `update candidatos set etapa_id, etapa_entrou_em=now()`, `insert kanban_history(de_etapa, para_etapa, movido_por)`. Se a etapa destino é terminal, opcional setar `candidatos.status` (contratado→'contratado', reprovado→'reprovado', desistente→'desistente').

---

## 5. Modal do card (expandido)

`components/funil/candidate-modal.tsx` (Dialog Base UI), aberto ao clicar no card:
- **Dados**: nome, telefone, CEP, idade, vaga de interesse, unidade.
- **Score IA + parecer**: placeholder (SP3).
- **Tags** (chips) e **notas internas** (textarea editável → server action `salvarNotas`).
- **Histórico de etapas**: lista de `kanban_history` (de→para, quem, quando).
- **Ações**: "Abrir conversa" (link `/chat?c=<conversationId>` — busca a conversa do candidato), "Mover etapa" (Select de etapas → `moverCandidato`), "Reprovar" (move p/ Reprovado). "Agendar Entrevista" = **SP5** (botão desabilitado com tooltip "chega na SP5").

---

## 6. Reuso da SP0/SP1

Helpers RLS (0002), padrão de policies, `update_updated_at`, runner de migration, clients supabase, `getCurrentProfile`/`rbac` (nav já tem "funil" p/ admin/rh/gestor_unidade), shadcn/Base UI + tokens, realtime (`setAuth`), `useUnidadeStore` (filtro de unidade). Tipos novos em `types/database.ts` (Funil, FunilEtapa, KanbanHistory; estender Candidato com etapa_id/etapa_entrou_em). AGENTS.md: Next 16 (proxy, async params, Base UI).

Nova dependência: `@dnd-kit/core` + `@dnd-kit/sortable` (npm install).

---

## 7. Testes (TDD)

Lógica testável (≥60% na lógica de negócio):
- **Score → faixa/cor** (`scoreFaixa(score)` → 'baixo'|'medio'|'alto' por limiares; null → 'sem'). TDD.
- **Tempo na etapa** (`tempoNaEtapa(etapaEntrouEm, agora)` → string "3d"/"5h"/"agora"). TDD.
- **Agrupar candidatos por etapa** (`agruparPorEtapa(etapas, candidatos)` → Map etapa→cards, preservando ordem das etapas, vazias incluídas). TDD.
- **Validações Zod** (moverCandidato input, notas).
- **moverCandidato** (serviço injetável, deps mockados): atualiza etapa + insere history; etapa terminal seta status; guard de tenant.
- (DnD e realtime são integração — cobertos por simulação/E2E.)

---

## 8. Fronteira de escopo (não é SP2)

- **Configurações > Funil** (CRUD de etapas: add/remove/renomear/reordenar/cor/SLA) → **SP2b**.
- **Vagas** (módulo de vagas + vínculo funil↔vaga + critérios p/ IA) → módulo próprio (PRD §7.8.3).
- **Agendar Entrevista** → SP5. **IA de score/parecer** → SP3. **Indicadores/dashboard** → SP4.

---

## 9. Critérios de aceitação (SP2)

1. Migration 0010/0011 aplicam limpo; seed cria o funil padrão + 10 etapas; trigger coloca candidato novo na 1ª etapa; backfill move os existentes; RLS nas novas tabelas; realtime publica `candidatos`.
2. `/funil` renderiza colunas = etapas com os candidatos agrupados; card mini mostra nome/vaga/score/tempo/tags.
3. Arrastar um card para outra etapa persiste (`etapa_id` muda) e registra `kanban_history`; etapa crítica pede confirmação; realtime atualiza outra aba.
4. Modal do card mostra dados + notas (editáveis) + histórico de etapas; "Abrir conversa" linka o chat do candidato.
5. ≥60% de cobertura na lógica (score/tempo/agrupar/mover); `tsc` limpo; `lint` 0 erros; `build` OK; testes SP0/SP1 verdes.

---

## 10. Riscos & mitigações

| Risco | Mitigação |
|-------|-----------|
| Candidato sem etapa (SP1 não sabe de funil) | Trigger de colocação automática na 1ª etapa do funil padrão + backfill. |
| Drag otimista divergir do servidor | Mover otimista + reconciliar via realtime/`router.refresh()`; reverter + toast em erro. |
| Mover para etapa de outra empresa/funil | `moverCandidato` valida que a etapa destino pertence ao mesmo `empresa_id` (e idealmente ao mesmo funil do candidato). |
| Realtime sem setAuth | `supabase.realtime.setAuth(token)` antes de assinar (padrão SP1). |
| Loop de realtime ao mover | O update muda `etapa_id` (valor real muda) → 1 evento; sem loop. |
| @dnd-kit + Next 16/React 19 | Lib estável com React 19; client component; testar no build. |

---

**Fim — SP2 Funil (Quadro) Design v1.0**
