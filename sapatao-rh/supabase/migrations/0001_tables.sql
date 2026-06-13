-- SP0 Fundação — tabelas base (multi-tenant)

-- updated_at trigger helper
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- Empresas (tenants)
create table if not exists public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  logo_url   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists empresas_updated on public.empresas;
create trigger empresas_updated before update on public.empresas
  for each row execute function public.update_updated_at();

-- Unidades (por empresa)
create table if not exists public.unidades (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome       text not null,
  cidade     text,
  endereco   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists unidades_empresa_idx on public.unidades(empresa_id);
drop trigger if exists unidades_updated on public.unidades;
create trigger unidades_updated before update on public.unidades
  for each row execute function public.update_updated_at();

-- Profiles (1:1 com auth.users)
create table if not exists public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
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
create index if not exists profiles_empresa_idx on public.profiles(empresa_id);
drop trigger if exists profiles_updated on public.profiles;
create trigger profiles_updated before update on public.profiles
  for each row execute function public.update_updated_at();

-- Auditoria
create table if not exists public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas(id) on delete set null,
  ator_id     uuid references public.profiles(id) on delete set null,
  acao        text not null,
  entidade    text,
  entidade_id uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists audit_log_empresa_idx on public.audit_log(empresa_id, created_at desc);
