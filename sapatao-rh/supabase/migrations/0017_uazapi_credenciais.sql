-- 0017: SP1d — credenciais UAZAPI por empresa + log de eventos de webhook.

-- 1) Credenciais na instância (SENSÍVEL: fora da view safe e do grant por coluna da 0007).
alter table public.whatsapp_instances
  add column if not exists uazapi_base_url text,
  add column if not exists uazapi_admin_token text,
  add column if not exists webhook_public_url text;

comment on column public.whatsapp_instances.uazapi_admin_token is
  'SENSIVEL: admin token UAZAPI. Nunca exposto ao browser (sem grant, fora da view safe).';

-- 2) Log de eventos brutos do webhook (diagnóstico; retenção 50/empresa via prune).
create table if not exists public.whatsapp_webhook_events (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  event text,
  parsed_kind text not null default 'ignore',
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_empresa_recentes
  on public.whatsapp_webhook_events (empresa_id, created_at desc);

alter table public.whatsapp_webhook_events enable row level security;

-- SELECT só admin do tenant (ou platform admin). Sem policy de INSERT/UPDATE/DELETE
-- para authenticated: escrita é exclusiva do service role (bypassa RLS).
drop policy if exists whatsapp_webhook_events_select on public.whatsapp_webhook_events;
create policy whatsapp_webhook_events_select on public.whatsapp_webhook_events
  for select to authenticated
  using (
    (empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
    or public.is_platform_admin()
  );

-- 3) Retenção: mantém os p_keep mais recentes por empresa.
create or replace function public.prune_whatsapp_webhook_events(
  p_empresa_id uuid, p_keep integer default 50
) returns void language sql as $$
  delete from public.whatsapp_webhook_events
  where empresa_id = p_empresa_id
    and id not in (
      select id from public.whatsapp_webhook_events
      where empresa_id = p_empresa_id
      order by created_at desc
      limit p_keep
    );
$$;

revoke execute on function public.prune_whatsapp_webhook_events(uuid, integer)
  from anon, authenticated, public;
