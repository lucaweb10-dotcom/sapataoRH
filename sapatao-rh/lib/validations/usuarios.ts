import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha muito curta"),
});

export const roleSchema = z.enum(["admin", "rh", "gestor_unidade", "viewer"]);

const uuidSchema = z.uuid();

export const createUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Mínimo de 6 caracteres"),
  role: roleSchema,
  unidades_acesso: z.array(uuidSchema).default([]),
});

export const editUsuarioSchema = z.object({
  id: uuidSchema,
  role: roleSchema,
  unidades_acesso: z.array(uuidSchema).default([]),
  ativo: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUsuarioInput = z.infer<typeof createUsuarioSchema>;
export type EditUsuarioInput = z.infer<typeof editUsuarioSchema>;
