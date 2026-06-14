-- SP5: tabela de entrevistas agendadas
create table public.entrevistas (
  id           uuid        primary key default gen_random_uuid(),
  empresa_id   uuid        not null references public.empresas(id) on delete cascade,
  candidato_id uuid        not null references public.candidatos(id) on delete cascade,
  data_hora    timestamptz not null,
  formato      text        not null check (formato in ('presencial', 'online')),
  local_ou_link text,
  observacoes  text,
  criado_por   uuid        references auth.users(id),
  created_at   timestamptz not null default now()
);

alter table public.entrevistas enable row level security;

create policy "entrevistas_select_tenant" on public.entrevistas
  for select using (empresa_id = current_empresa_id());

create policy "entrevistas_insert_rh" on public.entrevistas
  for insert with check (
    empresa_id = current_empresa_id()
    and current_user_role() in ('admin', 'rh')
  );

create index entrevistas_candidato_idx
  on public.entrevistas(candidato_id, created_at desc);
