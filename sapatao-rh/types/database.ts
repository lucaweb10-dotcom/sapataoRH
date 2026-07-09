export type Role = "admin" | "rh" | "gestor_unidade" | "viewer";

type Timestamps = { created_at: string; updated_at: string };

export type Empresa = Timestamps & {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  ativa: boolean;
}

export type Unidade = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  cidade: string | null;
  endereco: string | null;
  ativa: boolean;
}

export type Profile = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  email: string;
  role: Role;
  platform_admin: boolean;
  unidades_acesso: string[];
  ativo: boolean;
}

export type AuditLog = {
  id: string;
  empresa_id: string | null;
  ator_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export type Direction = "inbound" | "outbound";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type MessageTipo =
  | "text" | "image" | "audio" | "video" | "document" | "ptt" | "sticker" | "system";
export type WhatsappStatus = "conectado" | "desconectado" | "qr_pendente" | "connecting";

export type WhatsappInstance = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  uazapi_instance_id: string | null;
  uazapi_token: string | null;
  uazapi_base_url: string | null;
  uazapi_admin_token: string | null;
  webhook_public_url: string | null;
  webhook_secret: string;
  status: WhatsappStatus;
  phone_number: string | null;
  connected_at: string | null;
  last_seen_at: string | null;
}

export type WhatsappWebhookEvent = {
  id: string;
  empresa_id: string;
  event: string | null;
  parsed_kind: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export type Candidato = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  telefone: string;
  cpf: string | null;
  cep: string | null;
  idade: number | null;
  endereco: string | null;
  tem_veiculo: boolean | null;
  vaga_interesse: string | null;
  unidade_id: string | null;
  etapa: string;
  origem: string;
  avatar_url: string | null;
  tags: string[];
  notas_internas: string | null;
  atribuido_a: string | null;
  score_ia: number | null;
  parecer_ia: Record<string, unknown> | null;
  curriculo_url: string | null;
  status: "ativo" | "contratado" | "reprovado" | "desistente";
  etapa_id: string | null;
  etapa_entrou_em: string | null;
}

export type Conversation = Timestamps & {
  id: string;
  empresa_id: string;
  candidato_id: string;
  instance_id: string | null;
  status: "aberta" | "em_atendimento" | "arquivada";
  atribuida_a: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_message_direction: Direction | null;
  unread_count: number;
  uazapi_chat_id: string | null;
}

export type Message = {
  id: string;
  empresa_id: string;
  conversation_id: string;
  uazapi_msg_id: string | null;
  client_message_id: string | null;
  direction: Direction;
  tipo: MessageTipo;
  conteudo: string | null;
  midia_url: string | null;
  midia_mime: string | null;
  thumbnail_url: string | null;
  status: MessageStatus;
  sender_id: string | null;
  reply_to_provider_id: string | null;
  metadata: Record<string, unknown>;
  enviada_em: string;
  lida_em: string | null;
  created_at: string;
}

export type MessageTemplate = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  categoria: string | null;
  conteudo: string;
  variaveis: string[];
  ativo: boolean;
}

export type WhatsappOptout = {
  id: string;
  empresa_id: string;
  telefone: string;
  motivo: string | null;
  created_at: string;
}

export type Funil = Timestamps & {
  id: string;
  empresa_id: string;
  nome: string;
  ordem: number;
  is_default: boolean;
  ativo: boolean;
};

export type FunilEtapa = Timestamps & {
  id: string;
  empresa_id: string;
  funil_id: string;
  nome: string;
  ordem: number;
  cor: string;
  sla_dias: number | null;
  is_terminal: boolean;
  requires_confirm: boolean;
  status_destino: string | null;
  marcador: string | null;
};

export type KanbanHistory = {
  id: string;
  empresa_id: string;
  candidato_id: string;
  de_etapa: string | null;
  para_etapa: string | null;
  movido_por: string | null;
  observacao: string | null;
  created_at: string;
};

export type IaCriterios = Timestamps & {
  id: string;
  empresa_id: string;
  prompt_base: string;
  criterios: string[];
  modelo: string;
};

export type CvAnalise = {
  id: string;
  empresa_id: string;
  candidato_id: string;
  message_id: string | null;
  score: number | null;
  parecer: Record<string, unknown> | null;
  modelo: string | null;
  tokens_est: number | null;
  status: string;
  movido_por: string | null;
  created_at: string;
};

export type EntrevistaFormato = "presencial" | "online";

export type Entrevista = {
  id: string;
  empresa_id: string;
  candidato_id: string;
  data_hora: string;
  formato: EntrevistaFormato;
  local_ou_link: string | null;
  observacoes: string | null;
  criado_por: string | null;
  created_at: string;
};

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: Empresa;
        Insert: Partial<Empresa> & { nome: string; slug: string };
        Update: Partial<Empresa>;
        Relationships: [];
      };
      unidades: {
        Row: Unidade;
        Insert: Partial<Unidade> & { empresa_id: string; nome: string };
        Update: Partial<Unidade>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; empresa_id: string; nome: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      audit_log: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & { acao: string };
        Update: Partial<AuditLog>;
        Relationships: [];
      };
      whatsapp_instances: {
        Row: WhatsappInstance;
        Insert: Partial<WhatsappInstance> & { empresa_id: string };
        Update: Partial<WhatsappInstance>;
        Relationships: [];
      };
      whatsapp_webhook_events: {
        Row: WhatsappWebhookEvent;
        Insert: Partial<WhatsappWebhookEvent> & { empresa_id: string; payload: Record<string, unknown> };
        Update: Partial<WhatsappWebhookEvent>;
        Relationships: [];
      };
      candidatos: {
        Row: Candidato;
        Insert: Partial<Candidato> & { empresa_id: string; telefone: string };
        Update: Partial<Candidato>;
        Relationships: [];
      };
      conversations: {
        Row: Conversation;
        Insert: Partial<Conversation> & { empresa_id: string; candidato_id: string };
        Update: Partial<Conversation>;
        Relationships: [];
      };
      messages: {
        Row: Message;
        Insert: Partial<Message> & {
          empresa_id: string;
          conversation_id: string;
          direction: Direction;
        };
        Update: Partial<Message>;
        Relationships: [];
      };
      message_templates: {
        Row: MessageTemplate;
        Insert: Partial<MessageTemplate> & { empresa_id: string; nome: string; conteudo: string };
        Update: Partial<MessageTemplate>;
        Relationships: [];
      };
      whatsapp_optouts: {
        Row: WhatsappOptout;
        Insert: Partial<WhatsappOptout> & { empresa_id: string; telefone: string };
        Update: Partial<WhatsappOptout>;
        Relationships: [];
      };
      funis: {
        Row: Funil;
        Insert: Partial<Funil> & { empresa_id: string; nome: string };
        Update: Partial<Funil>;
        Relationships: [];
      };
      funil_etapas: {
        Row: FunilEtapa;
        Insert: Partial<FunilEtapa> & { empresa_id: string; funil_id: string; nome: string };
        Update: Partial<FunilEtapa>;
        Relationships: [];
      };
      kanban_history: {
        Row: KanbanHistory;
        Insert: Partial<KanbanHistory> & { empresa_id: string; candidato_id: string };
        Update: Partial<KanbanHistory>;
        Relationships: [];
      };
      ia_criterios: {
        Row: IaCriterios;
        Insert: Partial<IaCriterios> & { empresa_id: string; prompt_base: string };
        Update: Partial<IaCriterios>;
        Relationships: [];
      };
      cv_analises: {
        Row: CvAnalise;
        Insert: Partial<CvAnalise> & { empresa_id: string; candidato_id: string; status: string };
        Update: Partial<CvAnalise>;
        Relationships: [];
      };
      entrevistas: {
        Row: Entrevista;
        Insert: Partial<Entrevista> & { empresa_id: string; candidato_id: string; data_hora: string; formato: EntrevistaFormato };
        Update: Partial<Entrevista>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
