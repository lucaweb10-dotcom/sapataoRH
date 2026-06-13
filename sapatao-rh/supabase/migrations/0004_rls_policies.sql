-- RLS policies — tenant isolation by empresa + role.
-- NOTE: the service_role key bypasses RLS, so the seed script and the admin route
-- handler (service role) are never blocked by these policies; tenant safety there is
-- enforced in application code (defense in depth).

alter table public.empresas  enable row level security;
alter table public.unidades  enable row level security;
alter table public.profiles  enable row level security;
alter table public.audit_log enable row level security;

-- EMPRESAS: read own; platform admin reads all. Writes: platform admin only.
drop policy if exists empresas_select on public.empresas;
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists empresas_write on public.empresas;
create policy empresas_write on public.empresas for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- UNIDADES: read within tenant; write requires admin (or platform admin).
drop policy if exists unidades_select on public.unidades;
create policy unidades_select on public.unidades for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists unidades_write on public.unidades;
create policy unidades_write on public.unidades for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin());

-- PROFILES: read within tenant; write requires admin (or platform admin).
-- (auth_admin_reads_profiles from 0003 also applies, for token minting.)
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists profiles_write on public.profiles;
create policy profiles_write on public.profiles for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin());

-- AUDIT_LOG: read within tenant (admin/platform); insert within tenant.
drop policy if exists audit_select on public.audit_log;
create policy audit_select on public.audit_log for select to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin());
drop policy if exists audit_insert on public.audit_log;
create policy audit_insert on public.audit_log for insert to authenticated
  with check (empresa_id = public.current_empresa_id() or public.is_platform_admin());
