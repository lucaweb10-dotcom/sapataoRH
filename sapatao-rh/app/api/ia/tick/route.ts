import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { varrerPendentes, enviarFollowUps } from "@/lib/triagem/servico";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Worker da triagem. Faz duas coisas:
 *   1. termina turnos que o caminho do webhook não concluiu (reinício de processo);
 *   2. dispara os follow-ups únicos.
 *
 * Precisa de um agendador externo chamando a cada ~30s (cron do host, Vercel Cron
 * ou `node scripts/tick.mjs` em dev). SEM agendador, o atendimento reativo segue
 * funcionando normalmente pelo webhook — só o follow-up e a rede de proteção é
 * que deixam de existir.
 *
 * Protegido por IA_TICK_SECRET: é um endpoint que gasta dinheiro.
 */
export async function POST(req: Request) {
  const esperado = process.env.IA_TICK_SECRET;
  if (!esperado) {
    return NextResponse.json({ error: "tick_desabilitado" }, { status: 503 });
  }
  const recebido =
    req.headers.get("x-ia-tick-secret") ?? new URL(req.url).searchParams.get("secret");
  if (recebido !== esperado) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const admin = createAdminClient();
  const agora = new Date();

  const [pendentes, followups] = await Promise.all([
    varrerPendentes(admin, 20, agora).catch((err) => {
      console.error("tick/varrer:", err);
      return { processadas: 0 };
    }),
    enviarFollowUps(admin, 20, agora).catch((err) => {
      console.error("tick/followup:", err);
      return { enviados: 0 };
    }),
  ]);

  return NextResponse.json({ ok: true, ...pendentes, ...followups });
}
