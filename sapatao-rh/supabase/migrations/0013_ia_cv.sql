-- SP3a — IA de Currículo: critérios por empresa + log de análises

create table if not exists public.ia_criterios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  prompt_base text not null,
  criterios jsonb not null default '[]',
  modelo text not null default 'mock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ia_criterios_empresa_uq on public.ia_criterios(empresa_id);
drop trigger if exists ia_criterios_updated on public.ia_criterios;
create trigger ia_criterios_updated before update on public.ia_criterios
  for each row execute function public.update_updated_at();

create table if not exists public.cv_analises (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  score int,
  parecer jsonb,
  modelo text,
  tokens_est int,
  status text not null,   -- 'ok'|'arquivo_invalido'|'texto_vazio'|'ia_indisponivel'|'parecer_invalido'|'persist_falhou'
  movido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists cv_analises_candidato_idx on public.cv_analises(candidato_id, created_at desc);

-- RLS
alter table public.ia_criterios enable row level security;
alter table public.cv_analises  enable row level security;

-- ia_criterios: select tenant; write admin
drop policy if exists ia_criterios_select on public.ia_criterios;
create policy ia_criterios_select on public.ia_criterios for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists ia_criterios_write on public.ia_criterios;
create policy ia_criterios_write on public.ia_criterios for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin());

-- cv_analises: select tenant; insert admin/rh (o candidato referenciado deve ser da empresa)
drop policy if exists cv_analises_select on public.cv_analises;
create policy cv_analises_select on public.cv_analises for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists cv_analises_insert on public.cv_analises;
create policy cv_analises_insert on public.cv_analises for insert to authenticated
  with check (
    (((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin()))
    and exists (select 1 from public.candidatos c where c.id = candidato_id and c.empresa_id = empresa_id)
  );
