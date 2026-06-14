-- SP2b — marcador estável p/ etapas de sistema (ex.: a etapa que a IA usa)

alter table public.funil_etapas add column if not exists marcador text;

-- único por funil (quando presente)
create unique index if not exists funil_etapas_marcador_uq
  on public.funil_etapas(funil_id, marcador) where marcador is not null;

-- backfill: a etapa "Análise IA Concluída" passa a ter o marcador usado pela SP3
update public.funil_etapas set marcador = 'ia_concluida'
  where nome = 'Análise IA Concluída' and marcador is null;
