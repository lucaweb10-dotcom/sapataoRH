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

// ── Cache ────────────────────────────────────────────────────────────────────
// Sem isto TODO envio e TODO webhook faziam uma query só para ler duas colunas
// que quase nunca mudam. TTL curto porque a config vem da UI: 60s é o atraso
// máximo aceitável para uma troca de credencial se propagar, e `invalidate`
// zera na hora quando a troca passa pelo nosso próprio código.
const TTL_MS = 60_000;
type Entry = { value: UazapiConfig | null; expiresAt: number };
const cache = new Map<string, Entry>();

/** Chamar após qualquer escrita nas credenciais da empresa. */
export function invalidateUazapiConfig(empresaId?: string): void {
  if (empresaId) cache.delete(empresaId);
  else cache.clear();
}

/** Test-only seam. */
export function __resetUazapiConfigCache(): void {
  cache.clear();
}

export async function getUazapiConfig(
  admin: ReturnType<typeof createAdminClient>,
  empresaId: string,
  now: () => number = Date.now,
): Promise<UazapiConfig | null> {
  const hit = cache.get(empresaId);
  if (hit && hit.expiresAt > now()) return hit.value;

  const { data, error } = await admin
    .from("whatsapp_instances")
    .select("uazapi_base_url, uazapi_admin_token")
    .eq("empresa_id", empresaId)
    .maybeSingle();

  // Erro de leitura não é cacheado — senão um blip de rede cega o envio por 60s.
  if (error) {
    return resolveUazapiConfig(null, {
      url: process.env.UAZAPI_API_URL,
      adminToken: process.env.UAZAPI_ADMIN_TOKEN,
    });
  }

  const value = resolveUazapiConfig(data ?? null, {
    url: process.env.UAZAPI_API_URL,
    adminToken: process.env.UAZAPI_ADMIN_TOKEN,
  });
  cache.set(empresaId, { value, expiresAt: now() + TTL_MS });
  return value;
}
