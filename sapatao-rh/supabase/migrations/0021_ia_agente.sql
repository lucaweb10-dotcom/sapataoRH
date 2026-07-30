-- SP8 — Agente de IA: copiloto do gestor, livro-razão de uso e triagem automática.
--
-- Três frentes compartilham o mesmo teto mensal de tokens que já existia para as
-- análises (0019). Por isso ia_tokens_mes passa a somar cv_analises + ia_uso: sem
-- isso o copiloto e a triagem furariam o limite que o gestor configurou.

-- 1) Livro-razão de uso de IA que NÃO é análise (a análise continua em cv_analises,
--    que guarda score/parecer). Aqui só entra consumo: copiloto, triagem, follow-up.
create table if not exists public.ia_uso (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  tipo text not null check (tipo in ('copiloto','triagem','followup','transcricao')),
  candidato_id uuid references public.candidatos(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  modelo text,
  tokens_est int not null default 0,
  tokens_in int,
  tokens_out int,
  custo_usd numeric(12,6),
  status text not null default 'ok',
  created_at timestamptz not null default now()
);
create index if not exists ia_uso_empresa_mes_idx on public.ia_uso(empresa_id, created_at desc);
create index if not exists ia_uso_conversa_idx on public.ia_uso(conversation_id, created_at desc);

alter table public.ia_uso enable row level security;
-- Leitura no tenant (radar de custos); escrita só via service role.
drop policy if exists ia_uso_select on public.ia_uso;
create policy ia_uso_select on public.ia_uso for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());

-- 2) Teto mensal unificado. Mantém a fronteira de mês em UTC e a exclusão do
--    provider mock (não consome cota paga), igual à versão de 0019.
create or replace function public.ia_tokens_mes(p_empresa_id uuid)
returns bigint language sql stable as $$
  select (
    coalesce((
      select sum(tokens_est) from public.cv_analises
      where empresa_id = p_empresa_id
        and created_at >= date_trunc('month', now())
        and modelo is distinct from 'mock'
    ), 0)
    + coalesce((
      select sum(tokens_est) from public.ia_uso
      where empresa_id = p_empresa_id
        and created_at >= date_trunc('month', now())
        and modelo is distinct from 'mock'
    ), 0)
  )::bigint;
$$;
revoke execute on function public.ia_tokens_mes(uuid) from anon, authenticated, public;

-- 3) Thread do copiloto: conversa PRIVADA do gestor com a IA sobre um candidato.
--    O candidato nunca vê; cada gestor só enxerga a própria thread.
create table if not exists public.ia_copiloto_mensagens (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  conteudo text not null,
  created_at timestamptz not null default now()
);
create index if not exists ia_copiloto_thread_idx
  on public.ia_copiloto_mensagens(candidato_id, user_id, created_at);

alter table public.ia_copiloto_mensagens enable row level security;
drop policy if exists ia_copiloto_select on public.ia_copiloto_mensagens;
create policy ia_copiloto_select on public.ia_copiloto_mensagens for select to authenticated
  using (
    (empresa_id = public.current_empresa_id() and user_id = auth.uid())
    or public.is_platform_admin()
  );
-- Escrita só via service role: a rota grava o par (pergunta, resposta) junto.

-- 4) Estado da triagem automática — uma linha por conversa.
--    responder_em/processando_ate são o coração do anti-loop: o debounce agenda,
--    a claim atômica em processando_ate garante que só UM worker responde.
create table if not exists public.ia_triagem (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  ativa boolean not null default true,
  estado text not null default 'aguardando'
    check (estado in ('aguardando','perguntando','aguardando_cv','concluida','handoff','pausada')),
  passo int not null default 0,
  cargo_id uuid references public.ia_cargos(id) on delete set null,
  respostas jsonb not null default '{}'::jsonb,
  turnos int not null default 0,
  responder_em timestamptz,
  processando_ate timestamptz,
  ultimo_inbound_em timestamptz,
  followup_enviado_em timestamptz,
  motivo_parada text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id)
);
create index if not exists ia_triagem_empresa_idx on public.ia_triagem(empresa_id);
-- Fila do worker: só o que está agendado e ainda ativo.
create index if not exists ia_triagem_fila_idx
  on public.ia_triagem(responder_em) where ativa and responder_em is not null;
-- Candidatos a follow-up: nunca receberam um e ainda estão em andamento.
create index if not exists ia_triagem_followup_idx
  on public.ia_triagem(ultimo_inbound_em) where ativa and followup_enviado_em is null;

drop trigger if exists ia_triagem_updated on public.ia_triagem;
create trigger ia_triagem_updated before update on public.ia_triagem
  for each row execute function public.update_updated_at();

alter table public.ia_triagem enable row level security;
-- Leitura no tenant (badge "IA atendendo" no chat); escrita só via service role,
-- inclusive o liga/desliga por conversa, que passa por server action.
drop policy if exists ia_triagem_select on public.ia_triagem;
create policy ia_triagem_select on public.ia_triagem for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());

comment on column public.ia_triagem.followup_enviado_em is
  'null = nunca enviado. A claim `set ... where followup_enviado_em is null` garante 1 follow-up por conversa, para sempre.';
comment on column public.ia_triagem.processando_ate is
  'Lease de processamento. Claim atômica impede que dois webhooks simultâneos respondam a mesma conversa.';

-- 5) Config da triagem por empresa. Padrão DESLIGADO — nada dispara sem alguém ligar.
alter table public.ia_criterios
  add column if not exists triagem_ativa boolean not null default false,
  add column if not exists triagem_config jsonb not null default '{}'::jsonb;

comment on column public.ia_criterios.triagem_ativa is
  'Kill switch da empresa: false corta todo envio automático na hora.';
comment on column public.ia_criterios.triagem_config is
  '{roteiro[], debounce_seg, max_turnos, teto_hora, teto_dia, followup_horas, horario_inicio, horario_fim, modelo_triagem}';

-- Grants por coluna (padrão de 0019: openai_api_key segue sem grant). As colunas
-- novas são legíveis pelo tenant; escrita continua só via service role.
grant select (
  id, empresa_id, prompt_base, criterios, modelo, provider, limite_tokens_mes,
  triagem_ativa, triagem_config, created_at, updated_at
) on public.ia_criterios to authenticated;

-- 6) Índice do teto por conversa (trava 5): contar mensagens da IA na janela.
--    Parcial, então só indexa o que a IA mandou — barato mesmo com histórico grande.
create index if not exists messages_ia_origem_idx
  on public.messages(conversation_id, created_at)
  where metadata->>'origem' = 'ia';
