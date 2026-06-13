-- SP1a — RLS (padrão SP0) + proteção do token da instância

alter table public.whatsapp_instances enable row level security;
alter table public.candidatos         enable row level security;
alter table public.conversations      enable row level security;
alter table public.messages           enable row level security;
alter table public.message_templates  enable row level security;
alter table public.whatsapp_optouts   enable row level security;

-- Helper macro (escrito por extenso por tabela). Tenant select + admin/rh write.

-- candidatos
drop policy if exists candidatos_select on public.candidatos;
create policy candidatos_select on public.candidatos for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists candidatos_write on public.candidatos;
create policy candidatos_write on public.candidatos for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- conversations
drop policy if exists conversations_select on public.conversations;
create policy conversations_select on public.conversations for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists conversations_write on public.conversations;
create policy conversations_write on public.conversations for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- messages
drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists messages_write on public.messages;
create policy messages_write on public.messages for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- message_templates
drop policy if exists message_templates_select on public.message_templates;
create policy message_templates_select on public.message_templates for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists message_templates_write on public.message_templates;
create policy message_templates_write on public.message_templates for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- whatsapp_optouts
drop policy if exists whatsapp_optouts_select on public.whatsapp_optouts;
create policy whatsapp_optouts_select on public.whatsapp_optouts for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists whatsapp_optouts_write on public.whatsapp_optouts;
create policy whatsapp_optouts_write on public.whatsapp_optouts for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- whatsapp_instances: select tenant; write admin-only
drop policy if exists whatsapp_instances_select on public.whatsapp_instances;
create policy whatsapp_instances_select on public.whatsapp_instances for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists whatsapp_instances_write on public.whatsapp_instances;
create policy whatsapp_instances_write on public.whatsapp_instances for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin());

-- Proteção do token: o browser NÃO pode ler uazapi_token.
revoke select on public.whatsapp_instances from anon, authenticated;
grant select (id, empresa_id, nome, uazapi_instance_id, webhook_secret, status,
              phone_number, connected_at, last_seen_at, created_at, updated_at)
  on public.whatsapp_instances to authenticated;

drop view if exists public.whatsapp_instances_safe;
create view public.whatsapp_instances_safe with (security_invoker = true) as
  select id, empresa_id, nome, uazapi_instance_id, status, phone_number,
         connected_at, last_seen_at, created_at, updated_at
  from public.whatsapp_instances;
