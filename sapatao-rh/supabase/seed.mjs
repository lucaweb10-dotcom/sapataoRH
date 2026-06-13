// Bootstrap seed (idempotent): Estação Sapatão + unidade Novo Hamburgo + first admin.
// Uses the service role (bypasses RLS). Reads secrets from .env.local.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // 1) empresa (idempotent by slug)
  let { data: empresa } = await admin
    .from("empresas")
    .select("*")
    .eq("slug", "estacao-sapatao")
    .maybeSingle();
  if (!empresa) {
    ({ data: empresa } = await admin
      .from("empresas")
      .insert({ nome: "Estação Sapatão", slug: "estacao-sapatao", ativa: true })
      .select()
      .single());
    console.log("empresa criada:", empresa.id);
  } else {
    console.log("empresa já existe:", empresa.id);
  }

  // 2) unidade Novo Hamburgo (idempotent by nome+empresa)
  let { data: unidade } = await admin
    .from("unidades")
    .select("*")
    .eq("empresa_id", empresa.id)
    .eq("nome", "Novo Hamburgo")
    .maybeSingle();
  if (!unidade) {
    ({ data: unidade } = await admin
      .from("unidades")
      .insert({ empresa_id: empresa.id, nome: "Novo Hamburgo", cidade: "Novo Hamburgo", ativa: true })
      .select()
      .single());
    console.log("unidade criada:", unidade.id);
  } else {
    console.log("unidade já existe:", unidade.id);
  }

  // 3) admin auth user (idempotent — skip if email already exists)
  const email = process.env.SEED_ADMIN_EMAIL;
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: process.env.SEED_ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log("admin auth user criado:", user.id);
  } else {
    console.log("admin auth user já existe:", user.id);
  }

  // 4) profile (upsert)
  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id,
    empresa_id: empresa.id,
    nome: "Lucas (Admin)",
    email,
    role: "admin",
    platform_admin: true,
    unidades_acesso: [unidade.id],
    ativo: true,
  });
  if (pErr) throw pErr;
  console.log("profile admin pronto.");

  // 5) whatsapp instance (idempotente — 1 por empresa)
  const { data: inst } = await admin
    .from("whatsapp_instances")
    .select("id")
    .eq("empresa_id", empresa.id)
    .maybeSingle();
  if (!inst) {
    await admin.from("whatsapp_instances").insert({
      empresa_id: empresa.id,
      nome: "WhatsApp RH",
      status: "desconectado",
    });
    console.log("whatsapp instance criada");
  } else {
    console.log("whatsapp instance já existe");
  }

  // 6) templates de triagem (idempotente por nome)
  const templates = [
    { nome: "Idade ≥18", conteudo: "Olá! Para seguirmos, você já tem 18 anos ou mais?" },
    { nome: "CEP", conteudo: "Qual o seu CEP? Assim avaliamos a distância até a unidade." },
    { nome: "Veículo próprio", conteudo: "Você tem veículo próprio ou outro meio de locomoção?" },
    { nome: "Vaga de interesse", conteudo: "Qual vaga te interessa? (Frentista, Caixa, Atendente, Cozinha...)" },
    { nome: "Pede currículo", conteudo: "Pode nos enviar seu currículo por aqui? (PDF ou foto)" },
  ];
  for (const tpl of templates) {
    const { data: ex } = await admin
      .from("message_templates")
      .select("id")
      .eq("empresa_id", empresa.id)
      .eq("nome", tpl.nome)
      .maybeSingle();
    if (!ex) {
      await admin.from("message_templates").insert({
        empresa_id: empresa.id,
        nome: tpl.nome,
        categoria: "filtro_inicial",
        conteudo: tpl.conteudo,
        variaveis: [],
      });
    }
  }
  console.log("templates de triagem prontos. Seed concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
