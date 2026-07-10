-- SP7 — Funis por unidade: o funil padrão (is_default) vira o funil "Geral" e
-- o TEMPLATE de clonagem; cada unidade pode ter seu próprio funil.
-- Decisões do usuário (2026-07-10): candidato sem unidade fica no Geral;
-- trocar a unidade migra o card p/ a etapa equivalente do funil da unidade.

-- 1) Vínculo funil ↔ unidade (null = funil Geral/template)
alter table public.funis
  add column if not exists unidade_id uuid references public.unidades(id) on delete cascade;
comment on column public.funis.unidade_id is
  'null = funil Geral da empresa (recebe candidatos sem unidade e serve de template). Um funil por unidade.';

create unique index if not exists funis_one_per_unidade
  on public.funis(empresa_id, unidade_id) where unidade_id is not null;

-- O funil Geral (default) NUNCA pertence a uma unidade (é o template da empresa).
alter table public.funis drop constraint if exists funis_default_sem_unidade_chk;
alter table public.funis add constraint funis_default_sem_unidade_chk
  check (not (is_default and unidade_id is not null));

-- 2) Colocação de candidato novo: funil da UNIDADE dele (se existir e ativo),
--    senão o funil Geral (default). Mantém a validação de etapa explícita.
create or replace function public.place_candidato_in_default_funil()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_etapa uuid;
begin
  if new.etapa_id is null then
    -- 1ª etapa do funil da unidade do candidato (quando houver funil próprio)
    if new.unidade_id is not null then
      select fe.id into v_etapa
      from public.funil_etapas fe
      join public.funis f on f.id = fe.funil_id
      where f.empresa_id = new.empresa_id
        and f.unidade_id = new.unidade_id
        and f.ativo
      order by fe.ordem asc
      limit 1;
    end if;
    -- fallback: funil Geral (default)
    if v_etapa is null then
      select fe.id into v_etapa
      from public.funil_etapas fe
      join public.funis f on f.id = fe.funil_id
      where f.empresa_id = new.empresa_id and f.is_default
      order by fe.ordem asc
      limit 1;
    end if;
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
