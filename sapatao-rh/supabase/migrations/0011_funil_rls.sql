-- SP2 — RLS do funil + realtime para candidatos

alter table public.funis          enable row level security;
alter table public.funil_etapas   enable row level security;
alter table public.kanban_history enable row level security;

-- funis: select tenant; write admin
drop policy if exists funis_select on public.funis;
create policy funis_select on public.funis for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists funis_write on public.funis;
create policy funis_write on public.funis for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin());

-- funil_etapas: select tenant; write admin
drop policy if exists funil_etapas_select on public.funil_etapas;
create policy funil_etapas_select on public.funil_etapas for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists funil_etapas_write on public.funil_etapas;
create policy funil_etapas_write on public.funil_etapas for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin') or public.is_platform_admin());

-- kanban_history: select tenant; insert admin/rh
drop policy if exists kanban_history_select on public.kanban_history;
create policy kanban_history_select on public.kanban_history for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
drop policy if exists kanban_history_insert on public.kanban_history;
create policy kanban_history_insert on public.kanban_history for insert to authenticated
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh')) or public.is_platform_admin());

-- realtime para o quadro (cards movem ao vivo)
do $$
begin
  alter publication supabase_realtime add table public.candidatos;
exception when duplicate_object then null;
end $$;
