-- SP2 — hardening pós-revisão: integridade tenant + constraints do funil

-- (1) kanban_history: o candidato referenciado deve pertencer à mesma empresa do row.
--     Fecha a brecha de defense-in-depth: a integridade não depende mais só do app.
drop policy if exists kanban_history_insert on public.kanban_history;
create policy kanban_history_insert on public.kanban_history for insert to authenticated
  with check (
    (((empresa_id = public.current_empresa_id() and public.current_user_role() in ('admin','rh'))
      or public.is_platform_admin()))
    and exists (select 1 from public.candidatos c where c.id = candidato_id and c.empresa_id = empresa_id)
  );

-- (2) status_destino só pode assumir os status terminais válidos de candidatos.status.
--     Impede que uma etapa mal configurada quebre o UPDATE de candidatos no move.
alter table public.funil_etapas drop constraint if exists funil_etapas_status_destino_chk;
alter table public.funil_etapas add constraint funil_etapas_status_destino_chk
  check (status_destino is null or status_destino in ('contratado','reprovado','desistente'));

-- (3) trigger: um etapa_id explícito (não-null) na inserção deve pertencer à empresa do candidato.
--     Quando null, mantém a colocação automática na 1ª etapa do funil padrão.
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
  else
    perform 1 from public.funil_etapas where id = new.etapa_id and empresa_id = new.empresa_id;
    if not found then
      raise exception 'etapa_id % não pertence à empresa %', new.etapa_id, new.empresa_id;
    end if;
  end if;
  return new;
end; $$;
