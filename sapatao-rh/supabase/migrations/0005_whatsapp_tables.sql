-- SP1a — tabelas do WhatsApp/Atendimento (multi-tenant, padrão SP0)

-- Instância WhatsApp (1 por empresa — número único compartilhado)
create table if not exists public.whatsapp_instances (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null default 'WhatsApp RH',
  uazapi_instance_id text unique,
  uazapi_token text,                       -- SENSÍVEL: nunca exposto ao browser
  webhook_secret text not null default replace(gen_random_uuid()::text, '-', ''),
  status text not null default 'desconectado'
    check (status in ('conectado','desconectado','qr_pendente','connecting')),
  phone_number text,
  connected_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists whatsapp_instances_one_per_empresa on public.whatsapp_instances(empresa_id);
drop trigger if exists whatsapp_instances_updated on public.whatsapp_instances;
create trigger whatsapp_instances_updated before update on public.whatsapp_instances
  for each row execute function public.update_updated_at();

-- Candidatos (entidade de domínio de 1ª classe)
create table if not exists public.candidatos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null default 'Desconhecido',
  telefone text not null,                  -- só dígitos, sem '+'
  cpf text, cep text, idade int, endereco text, tem_veiculo boolean,
  vaga_interesse text,
  unidade_id uuid references public.unidades(id) on delete set null,
  etapa text not null default 'triagem',
  origem text not null default 'whatsapp',
  avatar_url text,
  tags text[] not null default '{}',
  notas_internas text,
  atribuido_a uuid references public.profiles(id) on delete set null,
  score_ia int,
  parecer_ia jsonb,
  curriculo_url text,
  status text not null default 'ativo'
    check (status in ('ativo','contratado','reprovado','desistente')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);
create index if not exists candidatos_empresa_idx on public.candidatos(empresa_id);
drop trigger if exists candidatos_updated on public.candidatos;
create trigger candidatos_updated before update on public.candidatos
  for each row execute function public.update_updated_at();

-- Conversas (1 por candidato)
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  instance_id uuid references public.whatsapp_instances(id) on delete set null,
  status text not null default 'aberta' check (status in ('aberta','em_atendimento','arquivada')),
  atribuida_a uuid references public.profiles(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text,
  last_message_direction text,
  unread_count int not null default 0,
  uazapi_chat_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (empresa_id, candidato_id)
);
create index if not exists conversations_empresa_last_idx
  on public.conversations(empresa_id, last_message_at desc nulls last);
drop trigger if exists conversations_updated on public.conversations;
create trigger conversations_updated before update on public.conversations
  for each row execute function public.update_updated_at();

-- Mensagens (append-only; status atualizado in place)
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uazapi_msg_id text,
  client_message_id uuid,
  direction text not null check (direction in ('inbound','outbound')),
  tipo text not null default 'text'
    check (tipo in ('text','image','audio','video','document','ptt','sticker','system')),
  conteudo text,
  midia_url text, midia_mime text, thumbnail_url text,
  status text not null default 'sent'
    check (status in ('queued','sent','delivered','read','failed')),
  sender_id uuid references public.profiles(id) on delete set null,
  reply_to_provider_id text,
  metadata jsonb not null default '{}'::jsonb,
  enviada_em timestamptz not null default now(),
  lida_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at);
create index if not exists messages_empresa_idx on public.messages(empresa_id);
create unique index if not exists messages_inbound_dedup
  on public.messages(empresa_id, uazapi_msg_id) where uazapi_msg_id is not null;
create unique index if not exists messages_outbound_dedup
  on public.messages(empresa_id, client_message_id) where client_message_id is not null;

-- Templates de triagem
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome text not null,
  categoria text,
  conteudo text not null,
  variaveis text[] not null default '{}',
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists message_templates_empresa_idx on public.message_templates(empresa_id);
drop trigger if exists message_templates_updated on public.message_templates;
create trigger message_templates_updated before update on public.message_templates
  for each row execute function public.update_updated_at();

-- Opt-out
create table if not exists public.whatsapp_optouts (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  telefone text not null,
  motivo text,
  created_at timestamptz not null default now(),
  unique (empresa_id, telefone)
);
