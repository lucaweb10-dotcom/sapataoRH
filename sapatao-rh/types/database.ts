export type Role = "admin" | "rh" | "gestor_unidade" | "viewer";

type Timestamps = { created_at: string; updated_at: string };

export interface Empresa extends Timestamps {
  id: string;
  nome: string;
  slug: string;
  logo_url: string | null;
  ativa: boolean;
}

export interface Unidade extends Timestamps {
  id: string;
  empresa_id: string;
  nome: string;
  cidade: string | null;
  endereco: string | null;
  ativa: boolean;
}

export interface Profile extends Timestamps {
  id: string;
  empresa_id: string;
  nome: string;
  email: string;
  role: Role;
  platform_admin: boolean;
  unidades_acesso: string[];
  ativo: boolean;
}

export interface AuditLog {
  id: string;
  empresa_id: string | null;
  ator_id: string | null;
  acao: string;
  entidade: string | null;
  entidade_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: Empresa;
        Insert: Partial<Empresa> & { nome: string; slug: string };
        Update: Partial<Empresa>;
      };
      unidades: {
        Row: Unidade;
        Insert: Partial<Unidade> & { empresa_id: string; nome: string };
        Update: Partial<Unidade>;
      };
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; empresa_id: string; nome: string; email: string };
        Update: Partial<Profile>;
      };
      audit_log: {
        Row: AuditLog;
        Insert: Partial<AuditLog> & { acao: string };
        Update: Partial<AuditLog>;
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
