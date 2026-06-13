# SP0 — Fundação · Sapatão RH — Design / Spec

**Produto:** Sapatão RH — Plataforma de Recrutamento, Atendimento e Gestão de Pessoas
**Fatia:** SP0 — Fundação (base do roadmap; Fase 0 do PRD)
**Data:** 2026-06-13
**Status:** Aprovado para implementação
**PRD de referência:** [PRD_Sapatao_RH.md](../../../PRD_Sapatao_RH.md)

---

## 1. Contexto e objetivo

A plataforma é grande (6 subsistemas, ~12 semanas). Será construída em **fatias sequenciais**, cada uma com ciclo próprio: brainstorm → spec → plano → TDD → verificação. Esta spec cobre **apenas a SP0 — Fundação**, o alicerce de todas as fatias seguintes.

**Objetivo da SP0:** scaffold do projeto + schema base multi-tenant + autenticação + isolamento por empresa (RLS) + gestão interna de usuários/acessos + design system Sapatão + shell de navegação.

**Entrega verificável:** subir a app → logar como admin → criar um usuário de RH com acesso a 1 unidade → esse RH loga e enxerga só o permitido → navegação por role e isolamento por empresa funcionando.

### Mapa das fatias (contexto, fora do escopo desta spec)

| Fatia | Entrega | Fase PRD |
|-------|---------|----------|
| **SP0 — Fundação** *(esta spec)* | Scaffold + schema + auth + RLS + acessos + design system + shell | 0 |
| SP1 — Central de Atendimento | UAZAPI (webhook+envio), chat 3 colunas, realtime, fila otimista, candidatos | 1 |
| SP2 — Funil Kanban | Etapas configuráveis, drag-drop, múltiplos funis, histórico | 2 |
| SP3 — IA de Currículos | Chave LLM, "Analisar Currículo", extração de texto, parecer estruturado | 3 |
| SP4 — Funcionários & Indicadores | CRUD funcionários, promoção candidato→funcionário, dashboard KPIs | 4 |
| SP5 — Agendamento & Automação | Entrevistas, templates, cron lembrete D-1 | 5 |
| SP6 — Polimento & Go-live | QA, acessibilidade, migração, treino | 6 |

---

## 2. Decisões de arquitetura

| Decisão | Escolha | Justificativa |
|---------|---------|---------------|
| **Tenancy** | **Multi-empresa** (`empresa_id` em todas as tabelas) | NEXXA AI pode revender para outras empresas no mesmo deploy. Padrão do espelho First360. |
| **Isolamento** | **RLS-first com Custom Access Token Hook** | JWT carrega `empresa_id`/`role` → policies RLS rápidas (sem subquery em `profiles`). Defesa em profundidade: server-side revalida tenant+escopo por cima. |
| **Criação de usuários** | **Admin define login + senha** (sem convite por e-mail) | Bate com o sumário do PRD; prático para equipe de RH sem e-mail corporativo. Via `auth.admin.createUser` com service role. |
| **Bootstrap de empresas** | **Seed via script** (UI de criação de empresas deferida) | Criar empresa é raro e é a NEXXA quem faz. YAGNI para a SP0. |
| **Framework** | **Next.js App Router (estável mais recente, 15/16)** + React 19 + TS | Consistência com o espelho First360 (Next 16). PRD dizia 14; atualizado. |
| **Sessão** | **@supabase/ssr** (cookies) + middleware | Padrão SSR atual do Supabase; protege rotas `(app)/*`. |

### Stack completa da SP0
- **Next.js** (App Router, estável mais recente) + **React 19** + **TypeScript**.
- **TailwindCSS 4** + **shadcn/ui** + **Radix**.
- **Supabase**: Postgres + Auth (Storage/Realtime entram em fatias futuras).
- **@supabase/ssr** para sessão por cookies + middleware de proteção.
- **Zustand** + **TanStack Query** + **Zod** configurados na base (uso leve na SP0).
- Gerenciador de pacotes: **npm** (estabilidade no Windows).

---

## 3. Modelo de dados (tabelas da SP0)

Todas as tabelas: `created_at`/`updated_at`, RLS habilitado, policies escopadas por `empresa_id`. Tabelas das próximas fatias herdarão `empresa_id`.

```sql
-- Empresas (tenants)
create table empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  logo_url   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Unidades (por empresa)
create table unidades (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nome       text not null,
  cidade     text,
  endereco   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index unidades_empresa_idx on unidades(empresa_id);

-- Profiles (1:1 com auth.users)
create table profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  empresa_id      uuid not null references empresas(id) on delete cascade,
  nome            text not null,
  email           text not null,
  role            text not null default 'viewer'
                  check (role in ('admin','rh','gestor_unidade','viewer')),
  platform_admin  boolean not null default false,
  unidades_acesso uuid[] not null default '{}',
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_empresa_idx on profiles(empresa_id);

-- Auditoria (desde o dia 1)
create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references empresas(id) on delete set null,
  ator_id     uuid references profiles(id) on delete set null,
  acao        text not null,
  entidade    text,
  entidade_id uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_empresa_idx on audit_log(empresa_id, created_at desc);
```

Trigger genérico `update_updated_at()` aplicado às tabelas com `updated_at`.

---

## 4. Autenticação e sessão

- Login **e-mail + senha** (Supabase Auth, `email_confirm` automático — **sem verificação de e-mail**).
- Página pública `/login`. **Sem auto-cadastro público.**
- **Middleware** protege `(app)/*`: sessão ausente/expirada → redireciona para `/login`. Usuário com `profiles.ativo = false` → bloqueado com mensagem.
- Roles do PRD: `admin`, `rh`, `gestor_unidade`, `viewer`. Flag adicional `platform_admin` (NEXXA AI, acima de tudo).
- Cliente Supabase em 3 sabores: browser (anon), server component/action (anon + cookies), e **admin (service role, só em route handlers server-side — nunca exposto ao browser)**.

---

## 5. Isolamento de tenant (RLS)

### Custom Access Token Hook
Função Postgres que injeta claims no JWT a cada emissão de token:

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  v_empresa uuid; v_role text; v_platform boolean;
begin
  select empresa_id, role, platform_admin
    into v_empresa, v_role, v_platform
  from public.profiles where id = (event->>'user_id')::uuid;

  if v_empresa is not null then
    claims := jsonb_set(claims, '{empresa_id}',     to_jsonb(v_empresa::text));
    claims := jsonb_set(claims, '{user_role}',      to_jsonb(coalesce(v_role,'viewer')));
    claims := jsonb_set(claims, '{platform_admin}', to_jsonb(coalesce(v_platform,false)));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;
```

> Requer habilitar o hook na config do Supabase (Auth Hooks → Custom Access Token) — passo de setup documentado no plano.

### Funções auxiliares (lidas pela RLS)
```sql
create or replace function public.current_empresa_id() returns uuid
  language sql stable as $$ select nullif(auth.jwt()->>'empresa_id','')::uuid $$;

create or replace function public.is_platform_admin() returns boolean
  language sql stable as $$ select coalesce((auth.jwt()->>'platform_admin')::boolean, false) $$;

create or replace function public.current_user_role() returns text
  language sql stable as $$ select coalesce(auth.jwt()->>'user_role','viewer') $$;
```

### Padrão de policies
- **`empresas`**: SELECT só a própria empresa (`id = current_empresa_id()`); `is_platform_admin()` vê todas. Escrita: platform_admin (ou seed).
- **`unidades`**: SELECT/escrita onde `empresa_id = current_empresa_id()`; escrita restrita a `role = 'admin'` (ou platform_admin).
- **`profiles`**: SELECT da própria empresa; escrita só `admin`/platform_admin. Cada usuário lê o próprio profile sempre.
- **`audit_log`**: SELECT da própria empresa (admin/platform_admin); INSERT via server-side.

**Defesa em profundidade:** além da RLS, server actions/route handlers validam `empresa_id` e role antes de qualquer mutação (espelha a filosofia "função pura no app **E** política RLS" do First360).

---

## 6. Configurações > Acessos (gestão de usuários) — única tela funcional da SP0

- **Lista** de usuários da empresa: nome, e-mail, role, unidades, status (ativo/inativo).
- **"Novo usuário"** (modal): nome, e-mail, senha (definida ou gerada), role, unidades de acesso.
  - Implementação: **route handler server-side com service role** → `auth.admin.createUser({ email, password, email_confirm: true })` → INSERT em `profiles` (mesmo `id`, `empresa_id` do admin logado, role, unidades). Registra em `audit_log`.
- **Editar** role / unidades de acesso de um usuário.
- **Ativar/desativar**: `profiles.ativo` + (opcional) ban no Auth. Desativado não loga.
- **Acesso**: só `admin` e `platform_admin`. Demais roles não veem o item no menu nem acessam a rota (guard dupla: nav + server).

Regras de visibilidade por role (também usadas no shell):
- `admin`: tudo da sua empresa, incluindo Configurações.
- `rh`: chat, kanban, candidatos, funcionários, dashboard (sem Configurações).
- `gestor_unidade`: só suas unidades; ações limitadas (detalhado nas fatias seguintes).
- `viewer`: só dashboard.
- `platform_admin`: tudo + (futuro) gestão de empresas.

---

## 7. Design system & shell

- **Tokens da paleta Sapatão** (PRD §11) como CSS vars + tema Tailwind — **marcados como provisórios** até validar o manual da marca oficial.
- **Fontes** via `next/font`: Inter (UI/body), Bricolage Grotesque ou Archivo (display/headers), JetBrains Mono (IDs/código).
- **shadcn/ui** instalado e tematizado com os tokens.
- **App shell** `(app)/layout.tsx`:
  - **Sidebar**: Dashboard, Chat, Funil, Candidatos, Funcionários, Indicadores, Configurações — itens **filtrados por role**.
  - **Topbar**: seletor de **unidade** (filtro global, alimentado por `unidades_acesso`) + menu do usuário (nome, role, logout).
  - **Páginas internas = placeholders "em construção"**, exceto Configurações > Acessos (funcional).
- Microcopy PT-BR, voz ativa (tom do PRD §11.4). Acessibilidade básica: navegação por teclado, ARIA, contraste WCAG AA.

---

## 8. Bootstrap / seed

Script de seed (idempotente) cria:
1. Empresa **"Estação Sapatão"** (slug `estacao-sapatao`).
2. Unidade **Novo Hamburgo** (Estância Velha será cadastrada depois, pela UI de unidades).
3. Primeiro usuário **admin** via admin API + `profiles`:
   - e-mail: `lucas.a2weber@gmail.com`
   - senha: **temporária**, lida de `SEED_ADMIN_PASSWORD` no `.env.local` (gitignored) — não é versionada. Trocar no primeiro acesso (ver §13).
   - role `admin`, `platform_admin = true`, acesso à unidade Novo Hamburgo.

UI de criação/gestão de **novas empresas** fica **deferida** (fora da SP0).

---

## 9. Estrutura de pastas (subconjunto da SP0)

```
sapatao-rh/  (raiz do projeto, dentro desta pasta)
├── app/
│   ├── (auth)/login/
│   ├── (app)/
│   │   ├── layout.tsx                # shell (sidebar + topbar)
│   │   ├── dashboard/                # placeholder
│   │   ├── chat/ funil/ candidatos/ funcionarios/ indicadores/   # placeholders
│   │   └── configuracoes/
│   │       └── acessos/              # FUNCIONAL
│   ├── api/
│   │   └── usuarios/                 # route handler (service role)
│   └── layout.tsx / globals.css
├── components/ui/                    # shadcn
├── components/shell/                 # sidebar, topbar
├── lib/supabase/                     # browser/server/admin clients
├── lib/auth/                         # RBAC helpers, guards
├── lib/validations/                  # Zod
├── stores/ hooks/ types/
├── supabase/migrations/              # DDL + RLS + hook
├── supabase/seed.*                   # bootstrap
└── docs/superpowers/specs/
```

---

## 10. Testes (TDD)

Meta do PRD: **≥60% em lógica de negócio**. Alvos de teste na SP0:
- Helpers de RBAC: visibilidade por unidade, itens de nav por role, guards de rota.
- Schemas Zod (criação/edição de usuário, login).
- Função de criação de usuário (mockando a admin API do Supabase) — caminho feliz + erros (e-mail duplicado, sem permissão, tenant cruzado).
- Funções RLS auxiliares validadas por testes de policy (quando viável) ou por testes de integração no banco.

---

## 11. Fronteira de escopo (o que a SP0 NÃO faz)

- **Não** implementa Chat, Funil, IA, CRUD de Funcionários, Indicadores, Agendamento — apenas cria as rotas/placeholders e a navegação.
- **Não** cria buckets de Storage nem integrações UAZAPI/LLM.
- **Não** entrega UI de criação de novas empresas (deferida).
- **Não** faz convite por e-mail (modelo escolhido é admin define senha).

---

## 12. Critérios de aceitação da SP0

1. App sobe local sem erros; `/login` renderiza.
2. Seed cria Estação Sapatão + unidade Novo Hamburgo + admin; admin loga com sucesso.
3. Admin cria usuário de RH (e-mail+senha+role+unidades) em Configurações > Acessos.
4. Usuário RH loga e vê apenas os itens de menu do seu role; não acessa Configurações (bloqueio na nav e no server).
5. Isolamento por empresa comprovado: queries só retornam dados da empresa do usuário (RLS).
6. Páginas não-implementadas mostram placeholder claro "em construção".
7. Cobertura de testes ≥60% na lógica de negócio listada na §10.
8. Acessibilidade básica (teclado, ARIA, contraste AA) no login, shell e tela de Acessos.

---

## 13. Riscos & pontos de atenção

| Risco | Mitigação |
|-------|-----------|
| Service role vazar para o client | Usado **só** em route handlers server-side; nunca importado em componentes client; var de ambiente server-only. |
| Custom Access Token Hook mal configurado → RLS sem `empresa_id` | Passo de setup explícito no plano + teste que falha se claim ausente. Fallback: `current_empresa_id()` retorna null → default-deny. |
| Credenciais expostas no chat | `.env.local` no `.gitignore`; recomendado **rotacionar** as chaves Supabase no painel. |
| Senha do admin fraca (`REDACTED`) | Senha **temporária** de desenvolvimento; só no `.env.local` (não versionada). Forçar/recomendar troca no primeiro acesso. |
| Paleta não-oficial | Tokens marcados como provisórios; validar manual da marca antes do go-live. |

---

**Fim — SP0 Fundação Design v1.0**
