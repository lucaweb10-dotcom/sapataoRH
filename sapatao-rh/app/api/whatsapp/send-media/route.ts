import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendMediaSchema } from "@/lib/validations/whatsapp";
import { enviarMidia, type SendMediaDeps } from "@/lib/whatsapp/send-media";
import { sendMedia as uazapiSendMedia } from "@/lib/uazapi/client";
import { mimeToExt, tipoFromMime } from "@/lib/whatsapp/media-helpers";

function canSend(role: string, platformAdmin: boolean): boolean {
  return role === "admin" || role === "rh" || platformAdmin;
}

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || !canSend(profile.role, profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = sendMediaSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.flatten() }, { status: 422 });
  }
  const { conversationId, clientMessageId, fileBase64, mime, fileName, caption } = parsed.data;
  // Strip a possible data-URL prefix; UAZAPI + storage want raw base64.
  const rawB64 = fileBase64.replace(/^data:[^;]+;base64,/, "");

  const admin = createAdminClient();
  const empresaId = profile.empresa_id;
  const midiaPath = `${empresaId}/out-${clientMessageId}.${mimeToExt(mime)}`;

  // Upload to the bucket (for our own display via signed URL); best-effort.
  const bytes = Uint8Array.from(Buffer.from(rawB64, "base64"));
  const up = await admin.storage
    .from("whatsapp-media")
    .upload(midiaPath, bytes, { contentType: mime, upsert: true });
  if (up.error) console.error("send-media upload error:", up.error.message);

  const deps: SendMediaDeps = {
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
          tipo: tipoFromMime(mime),
          conteudo: row.caption ?? null,
          midia_url: row.midiaPath,
          midia_mime: mime,
          metadata: fileName ? { fileName } : {},
          client_message_id: row.clientMessageId,
          sender_id: row.senderId,
          status: "queued",
        })
        .select("id")
        .single();
      return { id: data?.id ?? null, error: error ? { code: error.code, message: error.message } : null };
    },
    async reuseFailed(messageId) {
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
    async sendMedia(token, number, args) {
      try {
        const { providerId } = await uazapiSendMedia(token, number.replace(/\D/g, ""), {
          ...args,
          fileBase64: rawB64,
        });
        return { providerId };
      } catch (e) {
        return { providerId: null, error: e instanceof Error ? e.message : "send_error" };
      }
    },
  };

  const result = await enviarMidia(
    { empresaId, conversationId, clientMessageId, senderId: profile.id, midiaPath, fileBase64: rawB64, mime, fileName, caption },
    deps,
  );

  if (!result.ok) {
    const status =
      result.error === "optout" ? 409 : result.error === "context_error" ? 404 : result.error === "send_failed" ? 502 : 500;
    return NextResponse.json({ error: result.error, messageId: result.messageId }, { status });
  }
  return NextResponse.json({ messageId: result.messageId }, { status: 201 });
}
