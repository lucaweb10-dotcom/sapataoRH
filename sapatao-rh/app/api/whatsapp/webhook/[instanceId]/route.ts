import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseUazapiEvent } from "@/lib/uazapi/webhook-parser";
import { handleInboundMessage, type DbLike } from "@/lib/whatsapp/inbound";
import type { MessageTipo } from "@/types/database";

type Admin = ReturnType<typeof createAdminClient>;

const MESSAGE_TIPOS: readonly MessageTipo[] = [
  "text", "image", "audio", "video", "document", "ptt", "sticker", "system",
];
/** UAZAPI may send a type outside our enum; clamp unknown types to 'text'. */
function toMessageTipo(t: string): MessageTipo {
  return (MESSAGE_TIPOS as readonly string[]).includes(t) ? (t as MessageTipo) : "text";
}

/** Adapt the service-role supabase client to the inbound pipeline's DbLike interface. */
function makeDb(admin: Admin): DbLike {
  return {
    async upsertCandidato({ empresa_id, telefone, nome }) {
      const { data: existing } = await admin
        .from("candidatos")
        .select("id, nome")
        .eq("empresa_id", empresa_id)
        .eq("telefone", telefone)
        .maybeSingle();
      if (existing) {
        // Only fill in a real name if we currently have the placeholder.
        if (existing.nome === "Desconhecido" && nome !== "Desconhecido") {
          await admin.from("candidatos").update({ nome }).eq("id", existing.id);
        }
        return { data: { id: existing.id }, error: null };
      }
      const { data, error } = await admin
        .from("candidatos")
        .insert({ empresa_id, telefone, nome })
        .select("id")
        .single();
      if (error?.code === "23505") {
        const { data: row } = await admin
          .from("candidatos")
          .select("id")
          .eq("empresa_id", empresa_id)
          .eq("telefone", telefone)
          .single();
        return { data: row, error: null };
      }
      return { data, error };
    },

    async upsertConversation({ empresa_id, candidato_id, instance_id }) {
      const { data: existing } = await admin
        .from("conversations")
        .select("id")
        .eq("empresa_id", empresa_id)
        .eq("candidato_id", candidato_id)
        .maybeSingle();
      if (existing) return { data: { id: existing.id }, error: null };
      const { data, error } = await admin
        .from("conversations")
        .insert({ empresa_id, candidato_id, instance_id })
        .select("id")
        .single();
      if (error?.code === "23505") {
        const { data: row } = await admin
          .from("conversations")
          .select("id")
          .eq("empresa_id", empresa_id)
          .eq("candidato_id", candidato_id)
          .single();
        return { data: row, error: null };
      }
      return { data, error };
    },

    async insertMessage(input) {
      const { error } = await admin
        .from("messages")
        .insert({ ...input, tipo: toMessageTipo(input.tipo) });
      return { data: error ? null : { id: "" }, error };
    },

    async insertOptout({ empresa_id, telefone }) {
      const { error } = await admin.from("whatsapp_optouts").insert({ empresa_id, telefone });
      // unique violation = already opted out; not an error for our purposes
      return { data: null, error: error?.code === "23505" ? null : error };
    },
  };
}

const CONNECTION_STATUS = {
  connected: "conectado",
  connecting: "connecting",
  disconnected: "desconectado",
} as const;

/**
 * UAZAPI webhook — one registration per instance, routed by uazapi_instance_id.
 * ALWAYS returns 200 (errors are logged, never propagated) to avoid provider retry storms.
 */
export async function POST(request: Request, ctx: { params: Promise<{ instanceId: string }> }) {
  try {
    const { instanceId } = await ctx.params;
    const secret = new URL(request.url).searchParams.get("secret");
    const raw = await request.json().catch(() => null);

    const admin = createAdminClient();
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("id, empresa_id, webhook_secret")
      .eq("uazapi_instance_id", instanceId)
      .maybeSingle();

    // Unknown instance or bad secret → silent 200 (do not leak existence).
    if (!inst) return NextResponse.json({ ok: true });
    // Fail closed: reject if the instance has no secret or the secret doesn't match.
    if (!inst.webhook_secret || secret !== inst.webhook_secret) {
      return NextResponse.json({ ok: true });
    }

    const event = parseUazapiEvent(raw);

    if (event.kind === "message" && event.direction === "inbound") {
      await handleInboundMessage(
        event,
        { empresa_id: inst.empresa_id, instance_id: inst.id },
        makeDb(admin),
      );
    } else if (event.kind === "connection") {
      await admin
        .from("whatsapp_instances")
        .update({ status: CONNECTION_STATUS[event.state], last_seen_at: new Date().toISOString() })
        .eq("id", inst.id);
    }
    // status events (messages_update) are handled in SP1b.

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("uazapi webhook error:", e);
    return NextResponse.json({ ok: true });
  }
}
