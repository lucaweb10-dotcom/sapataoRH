-- SP3b — IA real (OpenAI): config por empresa, critérios por cargo,
-- cache de transcrição, origem/custo da análise e soma mensal de tokens.

-- 1) Config por empresa (ia_criterios já é 1/empresa — 0013). Passa a guardar:
--    integração (provider/chave/modelo/limite) + critérios GERAIS da empresa.
alter table public.ia_criterios
  add column if not exists provider text
    check (provider is null or provider in ('mock','openai')),
  add column if not exists openai_api_key text,
  add column if not exists limite_tokens_mes int
    check (limite_tokens_mes is null or limite_tokens_mes > 0);
alter table public.ia_criterios alter column modelo set default 'gpt-5.6-terra';

comment on column public.ia_criterios.openai_api_key is
  'SENSIVEL: chave OpenAI da empresa. Sem grant a authenticated; leitura/escrita só via service role.';
comment on column public.ia_criterios.provider is
  'null = herda LLM_PROVIDER do env. mock|openai.';
comment on column public.ia_criterios.criterios is
  'v1: array json de strings (legado). v2: {versao:2, nao_eliminar[], distancia_max, unidades[], contexto} — critérios GERAIS; os por-cargo ficam em ia_cargos.';

-- Proteção da chave (padrão 0007/0017): revoke total + grant por coluna SEM openai_api_key.
-- As policies ia_criterios_select/ia_criterios_write (0013) continuam valendo por cima.
-- Escrita de provider/modelo/limite só via service role (salvarIntegracao) — o client
-- RLS grava apenas prompt_base/criterios (questionário).
revoke select, insert, update, delete on public.ia_criterios from anon, authenticated;
grant select (id, empresa_id, prompt_base, criterios, modelo, provider, limite_tokens_mes, created_at, updated_at)
  on public.ia_criterios to authenticated;
grant insert (empresa_id, prompt_base, criterios) on public.ia_criterios to authenticated;
grant update (prompt_base, criterios) on public.ia_criterios to authenticated;

-- 2) Critérios de avaliação POR CARGO (Frentista, Caixa, ...) — a análise roda p/ UM cargo.
create table if not exists public.ia_cargos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  criterios jsonb not null default '{}',  -- {eliminatorios[], desejaveis[], pontos_sucesso[], pontos_baixa[], contexto_cargo}
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists ia_cargos_empresa_nome_uq on public.ia_cargos(empresa_id, lower(nome));
drop trigger if exists ia_cargos_updated on public.ia_cargos;
create trigger ia_cargos_updated before update on public.ia_cargos
  for each row execute function public.update_updated_at();

alter table public.ia_cargos enable row level security;
drop policy if exists ia_cargos_select on public.ia_cargos;
create policy ia_cargos_select on public.ia_cargos for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists ia_cargos_write on public.ia_cargos;
create policy ia_cargos_write on public.ia_cargos for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin());

-- 3) Cache de transcrição de áudio (pagar 1x por áudio; null = nunca transcrito).
alter table public.messages add column if not exists transcricao text;
comment on column public.messages.transcricao is
  'Transcrição do áudio (cache da análise de IA). Escrita via client RLS admin/rh; null = pendente.';

-- 4) cv_analises: origem, cargo, vínculo com conversa e custo real (radar de custos).
alter table public.cv_analises
  add column if not exists origem text not null default 'cv' check (origem in ('cv','perfil')),
  add column if not exists conversation_id uuid references public.conversations(id) on delete set null,
  add column if not exists cargo_nome text,
  add column if not exists tokens_in int,
  add column if not exists tokens_out int,
  add column if not exists custo_usd numeric(12,6);
comment on column public.cv_analises.cargo_nome is 'Snapshot do cargo avaliado (null = análise geral).';
create index if not exists cv_analises_empresa_mes_idx on public.cv_analises(empresa_id, created_at desc);

-- 5) Soma de tokens do mês corrente (enforcement do limite; exec só via service role).
--    Fronteira do mês em UTC (date_trunc no servidor) — aceitável p/ teto de custo.
--    Análises do provider mock ficam fora (não consomem a cota paga da OpenAI).
create or replace function public.ia_tokens_mes(p_empresa_id uuid)
returns bigint language sql stable as $$
  select coalesce(sum(tokens_est), 0)::bigint
  from public.cv_analises
  where empresa_id = p_empresa_id
    and created_at >= date_trunc('month', now())
    and modelo is distinct from 'mock';
$$;
revoke execute on function public.ia_tokens_mes(uuid) from anon, authenticated, public;
