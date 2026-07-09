"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createInstance,
  connectInstance,
  instanceStatus,
  disconnectInstance,
  registerWebhook,
} from "@/lib/uazapi/client";
import { getUazapiConfig } from "@/lib/uazapi/config";
import {
  credenciaisUazapiSchema,
  webhookPublicoSchema,
} from "@/lib/validations/whatsapp";
import type { WhatsappInstance } from "@/types/database";

// ─── Guard helpers ────────────────────────────────────────────────────────────

type GuardError = { error: string };

async function requireAdmin(): Promise<
  { profile: NonNullable<Awaited<ReturnType<typeof getCurrentProfile>>> } | GuardError
> {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    return { error: "forbidden" };
  }
  return { profile };
}

function isGuardError(v: unknown): v is GuardError {
  return typeof v === "object" && v !== null && "error" in v;
}

// ─── Env checks ──────────────────────────────────────────────────────────────

async function getBaseUrl(): Promise<string> {
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

/**
 * Conectar: create or reuse the instance, generate QR, register webhook.
 * Returns { qr } on success. Token is NEVER returned to the client.
 */
export async function conectar(): Promise<{ qr?: string | null; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error };
  const { profile } = guard;

  const admin0 = createAdminClient();
  const cfg = await getUazapiConfig(admin0, profile.empresa_id);
  if (!cfg) return { error: "uazapi_nao_configurada" };
  if (!cfg.adminToken) return { error: "uazapi_sem_admin_token" };

  const admin = createAdminClient();

  // Read the empresa's instance row (service role — reads uazapi_token)
  const { data: instanceRow, error: fetchErr } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("empresa_id", profile.empresa_id)
    .single<WhatsappInstance>();

  if (fetchErr && fetchErr.code !== "PGRST116") {
    return { error: "db_error" };
  }

  let uazapiInstanceId = instanceRow?.uazapi_instance_id ?? null;
  let uazapiToken = instanceRow?.uazapi_token ?? null;
  const webhookSecret = instanceRow?.webhook_secret ?? crypto.randomUUID();

  // Create the UAZAPI instance if not yet provisioned
  if (!uazapiInstanceId || !uazapiToken) {
    const slug = profile.empresa_id.slice(0, 8);
    const instanceName = `sapatao-${slug}`;
    const created = await createInstance(cfg.baseUrl, cfg.adminToken, instanceName);
    uazapiInstanceId = created.instanceId;
    uazapiToken = created.token;

    // Persist the new instance credentials
    if (instanceRow) {
      await admin
        .from("whatsapp_instances")
        .update({
          uazapi_instance_id: uazapiInstanceId,
          uazapi_token: uazapiToken,
          webhook_secret: webhookSecret,
          status: "qr_pendente",
        })
        .eq("empresa_id", profile.empresa_id);
    } else {
      await admin.from("whatsapp_instances").insert({
        empresa_id: profile.empresa_id,
        nome: "WhatsApp RH",
        uazapi_instance_id: uazapiInstanceId,
        uazapi_token: uazapiToken,
        webhook_secret: webhookSecret,
        status: "qr_pendente",
      });
    }
  }

  // Connect (generate QR)
  const { qr } = await connectInstance(cfg.baseUrl, uazapiToken);

  // Register webhook so UAZAPI can push events back
  const { data: rowUrl } = await admin
    .from("whatsapp_instances")
    .select("webhook_public_url")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();
  const baseUrl = rowUrl?.webhook_public_url ?? (await getBaseUrl());
  await registerWebhook(
    cfg.baseUrl,
    uazapiToken,
    `${baseUrl}/api/whatsapp/webhook/${uazapiInstanceId}?secret=${webhookSecret}`,
  ).catch(() => {
    // Best-effort — proceed even if webhook registration fails
  });

  // Mark status as qr_pendente
  await admin
    .from("whatsapp_instances")
    .update({ status: "qr_pendente" })
    .eq("empresa_id", profile.empresa_id);

  return { qr };
}

/**
 * Consultar status da instância via UAZAPI.
 * Returns { status, phone }. Token never leaves the server.
 */
export async function statusInstancia(): Promise<{
  status?: string;
  phone?: string | null;
  qr?: string | null;
  paircode?: string | null;
  error?: string;
}> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error };
  const { profile } = guard;

  const admin = createAdminClient();
  const { data: instanceRow, error: fetchErr } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("empresa_id", profile.empresa_id)
    .single<WhatsappInstance>();

  if (fetchErr || !instanceRow?.uazapi_token) {
    return { error: "sem_instancia" };
  }

  const cfg = await getUazapiConfig(admin, profile.empresa_id);
  if (!cfg) return { error: "uazapi_nao_configurada" };

  const { status: rawStatus, qr, paircode } = await instanceStatus(
    cfg.baseUrl,
    instanceRow.uazapi_token,
  );

  // Normalize to our enum
  const normalized = normalizeInstanceStatus(rawStatus);

  // Persist
  if (normalized === "conectado") {
    await admin
      .from("whatsapp_instances")
      .update({ status: normalized, connected_at: new Date().toISOString() })
      .eq("empresa_id", profile.empresa_id);
  } else {
    await admin
      .from("whatsapp_instances")
      .update({ status: normalized })
      .eq("empresa_id", profile.empresa_id);
  }

  return { status: normalized, phone: instanceRow.phone_number, qr, paircode };
}

/**
 * Desconectar a instância.
 */
export async function desconectar(): Promise<{ ok?: boolean; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error };
  const { profile } = guard;

  const admin = createAdminClient();
  const { data: instanceRow } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("empresa_id", profile.empresa_id)
    .single<WhatsappInstance>();

  if (instanceRow?.uazapi_token) {
    const cfg = await getUazapiConfig(admin, profile.empresa_id);
    if (cfg) {
      await disconnectInstance(cfg.baseUrl, instanceRow.uazapi_token).catch(() => {
        // Best-effort — always proceed with local state cleanup
      });
    }
  }

  await admin
    .from("whatsapp_instances")
    .update({ status: "desconectado", connected_at: null })
    .eq("empresa_id", profile.empresa_id);

  return { ok: true };
}

/**
 * Salva as credenciais UAZAPI da empresa (upsert da linha da instância).
 * O token NUNCA volta para o cliente.
 */
export async function salvarCredenciais(input: {
  baseUrl: string;
  adminToken: string | null;
}): Promise<{ ok?: true; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error };
  const { profile } = guard;

  const parsed = credenciaisUazapiSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido" };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();

  // adminToken null = manter o token já salvo (só permitido em update)
  if (!existing && !parsed.data.adminToken) return { error: "token_obrigatorio" };

  const fields: Partial<WhatsappInstance> = { uazapi_base_url: parsed.data.baseUrl };
  if (parsed.data.adminToken) fields.uazapi_admin_token = parsed.data.adminToken;

  const { error } = existing
    ? await admin.from("whatsapp_instances").update(fields).eq("id", existing.id)
    : await admin.from("whatsapp_instances").insert({
        empresa_id: profile.empresa_id,
        nome: "WhatsApp RH",
        ...fields,
      });
  if (error) return { error: "db_error" };

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true };
}

/**
 * Salva a URL pública (túnel/domínio) e registra o webhook na UAZAPI.
 * registered=false quando a instância ainda não foi provisionada (sem token).
 */
export async function salvarWebhookPublico(input: {
  url: string;
}): Promise<{ ok?: true; registered: boolean; webhookUrl?: string; error?: string }> {
  const guard = await requireAdmin();
  if (isGuardError(guard)) return { error: guard.error, registered: false };
  const { profile } = guard;

  const parsed = webhookPublicoSchema.safeParse(input);
  if (!parsed.success) return { error: "invalido", registered: false };

  const admin = createAdminClient();
  const { data: row, error } = await admin
    .from("whatsapp_instances")
    .select("id, uazapi_instance_id, uazapi_token, webhook_secret")
    .eq("empresa_id", profile.empresa_id)
    .maybeSingle();
  if (error || !row) return { error: "sem_instancia", registered: false };

  await admin
    .from("whatsapp_instances")
    .update({ webhook_public_url: parsed.data.url })
    .eq("id", row.id);

  if (!row.uazapi_instance_id || !row.uazapi_token) {
    revalidatePath("/configuracoes/whatsapp");
    return { ok: true, registered: false };
  }

  const cfg = await getUazapiConfig(admin, profile.empresa_id);
  if (!cfg) return { error: "uazapi_nao_configurada", registered: false };

  const webhookUrl = `${parsed.data.url}/api/whatsapp/webhook/${row.uazapi_instance_id}?secret=${row.webhook_secret}`;
  try {
    await registerWebhook(cfg.baseUrl, row.uazapi_token, webhookUrl);
  } catch {
    return { error: "registro_falhou", registered: false };
  }

  revalidatePath("/configuracoes/whatsapp");
  return { ok: true, registered: true, webhookUrl };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeInstanceStatus(
  raw: string,
): "conectado" | "desconectado" | "qr_pendente" | "connecting" {
  const s = raw.trim().toLowerCase();
  if (s === "open" || s === "connected") return "conectado";
  if (s === "connecting" || s === "syncing" || s === "loading") return "connecting";
  if (s === "qr" || s === "qr_pendente") return "qr_pendente";
  return "desconectado";
}
