// E2E SP1d: exercita o WEBHOOK do app contra um gateway UAZAPI falso local.
// Pré-requisitos: supabase local + `npm run dev` no ar. Roda: npm run verify:sp1d
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const APP = process.env.APP_URL ?? "http://localhost:3000";
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

let pass = 0, fail = 0;
const ok = (name, cond) => (cond ? (pass++, console.log("  ✔", name)) : (fail++, console.error("  ✘", name)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// O E2E sobrescreve a linha da instância (upsert onConflict empresa_id) — salvar antes
// e restaurar depois, senão o teste derruba a integração UAZAPI ao vivo (credenciais reais).
const RESTORE_COLS =
  "uazapi_instance_id, uazapi_token, uazapi_base_url, uazapi_admin_token, webhook_secret, status, phone_number, nome, connected_at, last_seen_at";
let savedInstance = null, savedEmpresaId = null;
async function restaurarInstancia() {
  if (savedEmpresaId && savedInstance) {
    await admin.from("whatsapp_instances").update(savedInstance).eq("empresa_id", savedEmpresaId);
    console.log("instância real restaurada.");
  }
}

// ── gateway falso (só o que o webhook dispara: download de mídia) ────────────
const hits = [];
const gateway = createServer((req, res) => {
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    hits.push({ method: req.method, url: req.url, body: raw ? JSON.parse(raw) : null });
    res.writeHead(200, { "Content-Type": "application/json" });
    if (req.url === "/message/download") {
      // "JVBERi0..." é um PDF mínimo em base64 (assinatura %PDF-)
      res.end(JSON.stringify({ mimetype: "application/pdf", base64Data: "JVBERi0xLjQKJSVFT0Y=" }));
    } else {
      res.end(JSON.stringify({ response: "ok" }));
    }
  });
});
await new Promise((r) => gateway.listen(0, "127.0.0.1", r));
const GATEWAY = `http://127.0.0.1:${gateway.address().port}`;

async function main() {
  const { data: empresa } = await admin.from("empresas").select("id").eq("slug", "estacao-sapatao").single();

  // Salva a instância real ANTES de sobrescrever (restaurada no finally).
  savedEmpresaId = empresa.id;
  const { data: sInst } = await admin
    .from("whatsapp_instances").select(RESTORE_COLS).eq("empresa_id", empresa.id).maybeSingle();
  savedInstance = sInst;

  // Instância de teste apontando para o gateway falso
  const instanceId = `e2e-${randomUUID().slice(0, 8)}`;
  const secret = randomUUID().replaceAll("-", "");
  await admin.from("whatsapp_instances").upsert(
    {
      empresa_id: empresa.id, nome: "WhatsApp RH",
      uazapi_instance_id: instanceId, uazapi_token: "tok-e2e",
      uazapi_base_url: GATEWAY, uazapi_admin_token: "admin-e2e",
      webhook_secret: secret, status: "desconectado",
    },
    { onConflict: "empresa_id" },
  );

  const hook = (body) =>
    fetch(`${APP}/api/whatsapp/webhook/${instanceId}?secret=${secret}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });

  console.log("1) inbound texto");
  const phone = `5551977${String(Date.now()).slice(-6)}`;
  const msgId = `E2E-${randomUUID().slice(0, 12)}`;
  let r = await hook({
    event: "messages", instance: instanceId,
    message: {
      messageid: msgId, chatid: `${phone}@s.whatsapp.net`, fromMe: false,
      messageType: "text", text: "Olá, tenho interesse na vaga",
      senderName: "Candidata E2E", wasSentByApi: false,
      chat: { wa_name: "Candidata E2E" },
    },
  });
  ok("webhook respondeu 200", r.status === 200);
  await sleep(700);
  const { data: cand } = await admin.from("candidatos").select("id, nome").eq("empresa_id", empresa.id).eq("telefone", phone).maybeSingle();
  ok("candidato criado com nome do chat", cand?.nome === "Candidata E2E");
  const { data: msg } = await admin.from("messages").select("id, conteudo, direction").eq("empresa_id", empresa.id).eq("uazapi_msg_id", msgId).maybeSingle();
  ok("mensagem inbound gravada", msg?.direction === "inbound" && msg?.conteudo?.includes("interesse"));

  console.log("2) dedup na reentrega");
  await hook({
    event: "messages", instance: instanceId,
    message: { messageid: msgId, chatid: `${phone}@s.whatsapp.net`, fromMe: false, messageType: "text", text: "Olá, tenho interesse na vaga" },
  });
  await sleep(500);
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true }).eq("empresa_id", empresa.id).eq("uazapi_msg_id", msgId);
  ok("sem duplicata", count === 1);

  console.log("3) inbound mídia → download no gateway (base64Data) → storage");
  const mediaId = `E2E-${randomUUID().slice(0, 12)}`;
  await hook({
    event: "messages", instance: instanceId,
    message: {
      messageid: mediaId, chatid: `${phone}@s.whatsapp.net`, fromMe: false,
      messageType: "document", content: { mimetype: "application/pdf" },
      senderName: "Candidata E2E", wasSentByApi: false,
    },
  });
  await sleep(2500); // after() roda pós-resposta
  const dl = hits.find((h) => h.url === "/message/download" && h.body?.id === mediaId);
  ok("gateway recebeu /message/download com id certo", !!dl && dl.body.return_base64 === true);
  const { data: mmsg } = await admin.from("messages").select("midia_url, midia_mime").eq("empresa_id", empresa.id).eq("uazapi_msg_id", mediaId).maybeSingle();
  ok("mensagem tem midia_url + mime", !!mmsg?.midia_url && mmsg?.midia_mime === "application/pdf");
  if (mmsg?.midia_url) {
    const { data: blob } = await admin.storage.from("whatsapp-media").download(mmsg.midia_url);
    ok("arquivo existe no bucket", !!blob && blob.size > 0);
  } else {
    ok("arquivo existe no bucket", false);
  }

  console.log("4) status forward-only");
  await hook({ event: "messages_update", instance: instanceId, messageid: msgId, status: "read" });
  await sleep(500);
  const { data: after1 } = await admin.from("messages").select("status").eq("uazapi_msg_id", msgId).eq("empresa_id", empresa.id).single();
  ok("status avançou (read)", after1.status === "read");
  await hook({ event: "messages_update", instance: instanceId, messageid: msgId, status: "delivered" });
  await sleep(500);
  const { data: after2 } = await admin.from("messages").select("status").eq("uazapi_msg_id", msgId).eq("empresa_id", empresa.id).single();
  ok("não regrediu (segue read)", after2.status === "read");

  console.log("5) connection + log de eventos");
  await hook({ event: "connection", instance: instanceId, status: "connected" });
  await sleep(500);
  const { data: instRow } = await admin.from("whatsapp_instances").select("status").eq("empresa_id", empresa.id).single();
  ok("instância marcada conectado", instRow.status === "conectado");
  const { data: evs } = await admin.from("whatsapp_webhook_events").select("parsed_kind, payload").eq("empresa_id", empresa.id).order("created_at", { ascending: false }).limit(50);
  const evsThisRun = (evs ?? []).filter((e) => e.payload?.instance === instanceId);
  ok("eventos logados (message/status/connection)", ["message", "status", "connection"].every((k) => evsThisRun.some((e) => e.parsed_kind === k)));

  console.log("6) retenção (prune mantém só os 50 mais recentes por empresa)");
  for (let i = 0; i < 55; i++) {
    await hook({ event: "connection", instance: instanceId, status: "connected" });
  }
  await sleep(1000);
  const { count: retCount } = await admin
    .from("whatsapp_webhook_events")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresa.id);
  ok("retenção = 50 (prune)", retCount === 50);

  console.log(`\n${pass} ok, ${fail} falhas`);
  process.exitCode = fail ? 1 : 0;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await restaurarInstancia();
    gateway.close();
  });
