import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMessageSchema } from "@/lib/validations/whatsapp";
import { enviarMensagem, type SendDeps } from "@/lib/whatsapp/send";
import { sendText as uazapiSendText } from "@/lib/uazapi/client";

function canSend(role: string, platformAdmin: boolean): boolean {
  return role === "admin" || role === "rh" || platformAdmin;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canSend(profile.role, profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendMessageSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.flatten() }, { status: 422 });
  }
  const { conversationId, texto, clientMessageId } = parsed.data;

  const admin = createAdminClient();
  const empresaId = profile.empresa_id;

  const deps: SendDeps = {
    async loadContext(convId) {
      const { data: conv } = await admin
        .from("conversations")
        .select("id, empresa_id, candidato_id")
        .eq("id", convId)
        .maybeSingle();
      if (!conv || conv.empresa_id !== empresaId) return null;
      const { data: cand } = await admin
        .from("candidatos")
        .select("telefone")
        .eq("id", conv.candidato_id)
        .maybeSingle();
      if (!cand) return null;
      const { data: inst } = await admin
        .from("whatsapp_instances")
        .select("uazapi_token")
        .eq("empresa_id", empresaId)
        .maybeSingle();
      return { telefone: cand.telefone, token: inst?.uazapi_token ?? "" };
    },
    async isOptedOut(telefone) {
      const { data } = await admin
        .from("whatsapp_optouts")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("telefone", telefone)
        .maybeSingle();
      return !!data;
    },
    async findByClientId(cid) {
      const { data } = await admin
        .from("messages")
        .select("id, status")
        .eq("empresa_id", empresaId)
        .eq("client_message_id", cid)
        .maybeSingle();
      return data ? { id: data.id, status: data.status } : null;
    },
    async insertQueued(row) {
      const { data, error } = await admin
        .from("messages")
        .insert({
          empresa_id: row.empresaId,
          conversation_id: row.conversationId,
          direction: "outbound",
          tipo: "text",
          conteudo: row.texto,
          client_message_id: row.clientMessageId,
          sender_id: row.senderId,
          status: "queued",
        })
        .select("id")
        .single();
      return { id: data?.id ?? null, error: error ? { code: error.code, message: error.message } : null };
    },
    async reuseFailed(messageId) {
      // Atomic claim: only flips if the row is still 'failed'.
      const { data, error } = await admin
        .from("messages")
        .update({ status: "queued", metadata: {} })
        .eq("id", messageId)
        .eq("status", "failed")
        .select("id");
      return { claimed: (data?.length ?? 0) === 1, error: error ? { message: error.message } : null };
    },
    async updateResult(messageId, fields) {
      const patch =
        fields.status === "sent"
          ? { status: "sent" as const, uazapi_msg_id: fields.uazapi_msg_id }
          : { status: "failed" as const, metadata: { error: fields.error } };
      const { error } = await admin.from("messages").update(patch).eq("id", messageId);
      return { error: error ? { message: error.message } : null };
    },
    async sendText(token, number, text) {
      try {
        const { providerId } = await uazapiSendText(token, number.replace(/\D/g, ""), text);
        return { providerId };
      } catch (e) {
        return { providerId: null, error: e instanceof Error ? e.message : "send_error" };
      }
    },
  };

  const result = await enviarMensagem(
    { empresaId, conversationId, texto, clientMessageId, senderId: profile.id },
    deps,
  );

  if (!result.ok) {
    const status =
      result.error === "optout" ? 409 : result.error === "context_error" ? 404 : result.error === "send_failed" ? 502 : 500;
    return NextResponse.json({ error: result.error, messageId: result.messageId }, { status });
  }
  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}
