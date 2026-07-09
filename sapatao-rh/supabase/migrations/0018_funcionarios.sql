-- Módulo Funcionários (PRD 7.6): base mestre de pessoal + ocorrências.

create table public.funcionarios (
  id                  uuid primary key default gen_random_uuid(),
  empresa_id          uuid not null references public.empresas(id) on delete cascade,
  candidato_origem_id uuid references public.candidatos(id) on delete set null,
  nome_completo       text not null,
  cpf                 text,
  rg                  text,
  data_nascimento     date,
  telefone            text,
  email               text,
  cep                 text,
  endereco            text,
  cargo               text not null,
  unidade_id          uuid references public.unidades(id),
  data_admissao       date not null,
  data_demissao       date,
  salario             numeric(10,2),
  jornada             text,
  status              text not null default 'ativo'
                      check (status in ('ativo','inativo','afastado')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

drop trigger if exists funcionarios_updated on public.funcionarios;
create trigger funcionarios_updated before update on public.funcionarios
  for each row execute function public.update_updated_at();

create index funcionarios_empresa_idx
  on public.funcionarios(empresa_id, updated_at desc);
create index funcionarios_unidade_idx on public.funcionarios(unidade_id);
-- CPF único por empresa (quando informado); um candidato vira no máximo 1 funcionário.
create unique index funcionarios_cpf_unq
  on public.funcionarios(empresa_id, cpf) where cpf is not null;
create unique index funcionarios_candidato_unq
  on public.funcionarios(candidato_origem_id) where candidato_origem_id is not null;

create table public.funcionario_ocorrencias (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresas(id) on delete cascade,
  funcionario_id uuid not null references public.funcionarios(id) on delete cascade,
  tipo           text not null
                 check (tipo in ('falta','atestado','advertencia','elogio','desligamento','outro')),
  data           date not null,
  observacao     text,
  registrado_por uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index funcionario_ocorrencias_func_idx
  on public.funcionario_ocorrencias(funcionario_id, data desc);

-- RLS: leitura para o tenant; escrita admin/rh.
alter table public.funcionarios enable row level security;
alter table public.funcionario_ocorrencias enable row level security;

create policy "funcionarios_select_tenant" on public.funcionarios
  for select using (empresa_id = current_empresa_id());

create policy "funcionarios_insert_rh" on public.funcionarios
  for insert with check (
    empresa_id = current_empresa_id()
    and current_user_role() in ('admin','rh')
  );

create policy "funcionarios_update_rh" on public.funcionarios
  for update using (
    empresa_id = current_empresa_id()
    and current_user_role() in ('admin','rh')
  ) with check (empresa_id = current_empresa_id());

create policy "ocorrencias_select_tenant" on public.funcionario_ocorrencias
  for select using (empresa_id = current_empresa_id());

create policy "ocorrencias_insert_rh" on public.funcionario_ocorrencias
  for insert with check (
    empresa_id = current_empresa_id()
    and current_user_role() in ('admin','rh')
    and exists (
      select 1 from public.funcionarios f
      where f.id = funcionario_id and f.empresa_id = current_empresa_id()
    )
  );
