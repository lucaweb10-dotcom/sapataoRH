// Resolve as credenciais UAZAPI: banco (whatsapp_instances) > env. Null = não configurada.
import type { createAdminClient } from "@/lib/supabase/admin";

export type UazapiConfig = { baseUrl: string; adminToken: string | null };

type CredRow = { uazapi_base_url: string | null; uazapi_admin_token: string | null } | null;
type EnvLike = { url?: string; adminToken?: string };

const clean = (v: string | null | undefined): string | null =>
  typeof v === "string" && v.trim() ? v.trim().replace(/\/+$/, "") : null;

export function resolveUazapiConfig(row: CredRow, env: EnvLike): UazapiConfig | null {
  const baseUrl = clean(row?.uazapi_base_url) ?? clean(env.url);
  if (!baseUrl) return null;
  const adminToken = clean(row?.uazapi_admin_token) ?? clean(env.adminToken);
  return { baseUrl, adminToken };
}

export async function getUazapiConfig(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: string,
): Promise<UazapiConfig | null> {
  const { data } = await admin
    .from("whatsapp_instances")
    .select("uazapi_base_url, uazapi_admin_token")
    .eq("empresa_id", empresaId)
    .maybeSingle();
  return resolveUazapiConfig(data ?? null, {
    url: process.env.UAZAPI_API_URL,
    adminToken: process.env.UAZAPI_ADMIN_TOKEN,
  });
}
