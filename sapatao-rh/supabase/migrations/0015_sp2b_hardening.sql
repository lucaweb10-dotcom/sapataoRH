-- SP2b hardening:
--   1. Atomic funil-etapa reorder via RPC (replaces N separate UPDATEs)
--   2. Block deletion of system-marked etapas at DB level (belt-and-suspenders)

-- Atomic reorder: all UPDATEs run in one implicit transaction.
-- security invoker so RLS on funil_etapas still applies (admin-only write policy).
create or replace function reorder_funil_etapas(p_funil_id uuid, p_ids uuid[])
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  i int;
begin
  for i in 1..array_length(p_ids, 1) loop
    update funil_etapas
       set ordem = i
     where id = p_ids[i]
       and funil_id = p_funil_id;
  end loop;
end;
$$;

grant execute on function reorder_funil_etapas(uuid, uuid[]) to authenticated;

-- Belt-and-suspenders: block hard-delete of any etapa that carries a system marcador.
create or replace function trg_protect_system_etapa()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if OLD.marcador is not null then
    raise exception 'etapa_sistema: cannot delete etapa with marcador=%', OLD.marcador
      using errcode = 'P0001';
  end if;
  return OLD;
end;
$$;

drop trigger if exists protect_system_etapa on funil_etapas;
create trigger protect_system_etapa
  before delete on funil_etapas
  for each row execute function trg_protect_system_etapa();
