-- SP2 — Funil Kanban: tabelas + candidatos.etapa_id + trigger de colocação

create table if not exists public.funis (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  is_default boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funis_empresa_idx on public.funis(empresa_id);
create unique index if not exists funis_one_default on public.funis(empresa_id) where is_default;
drop trigger if exists funis_updated on public.funis;
create trigger funis_updated before update on public.funis
  for each row execute function public.update_updated_at();

create table if not exists public.funil_etapas (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  funil_id uuid not null references public.funis(id) on delete cascade,
  nome text not null,
  ordem int not null default 0,
  cor text not null default '#4A7C59',
  sla_dias int,
  is_terminal boolean not null default false,
  requires_confirm boolean not null default false,
  status_destino text,   -- terminais: 'contratado' | 'reprovado' | 'desistente'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists funil_etapas_funil_idx on public.funil_etapas(funil_id, ordem);
drop trigger if exists funil_etapas_updated on public.funil_etapas;
create trigger funil_etapas_updated before update on public.funil_etapas
  for each row execute function public.update_updated_at();

alter table public.candidatos add column if not exists etapa_id uuid references public.funil_etapas(id) on delete set null;
alter table public.candidatos add column if not exists etapa_entrou_em timestamptz;
create index if not exists candidatos_etapa_idx on public.candidatos(etapa_id);

create table if not exists public.kanban_history (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  de_etapa uuid references public.funil_etapas(id) on delete set null,
  para_etapa uuid references public.funil_etapas(id) on delete set null,
  movido_por uuid references public.profiles(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists kanban_history_candidato_idx on public.kanban_history(candidato_id, created_at desc);

-- Coloca um candidato novo na 1ª etapa do funil padrão da empresa.
create or replace function public.place_candidato_in_default_funil()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_etapa uuid;
begin
  if new.etapa_id is null then
    select fe.id into v_etapa
    from public.funil_etapas fe
    join public.funis f on f.id = fe.funil_id
    where f.empresa_id = new.empresa_id and f.is_default
    order by fe.ordem asc
    limit 1;
    if v_etapa is not null then
      new.etapa_id := v_etapa;
      new.etapa_entrou_em := now();
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists candidatos_place_funil on public.candidatos;
create trigger candidatos_place_funil before insert on public.candidatos
  for each row execute function public.place_candidato_in_default_funil();
