// Agendador de desenvolvimento: bate no /api/ia/tick a cada 30s.
//
// Em produção troque por um cron de verdade (cron do host, systemd timer,
// Vercel Cron). Rodar isto NÃO é obrigatório para o atendimento reativo — o
// webhook responde sozinho. É o follow-up e a rede de proteção que dependem daqui.
//
//   node scripts/tick.mjs
const URL_TICK = process.env.IA_TICK_URL ?? "http://localhost:3000/api/ia/tick";
const SECRET = process.env.IA_TICK_SECRET;
const INTERVALO_MS = Number(process.env.IA_TICK_INTERVALO_MS ?? 30_000);

if (!SECRET) {
  console.error("IA_TICK_SECRET não definido no ambiente. Abortando.");
  process.exit(1);
}

async function bater() {
  try {
    const res = await fetch(URL_TICK, {
      method: "POST",
      headers: { "x-ia-tick-secret": SECRET },
    });
    const corpo = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[tick] HTTP ${res.status}`, corpo);
      return;
    }
    if (corpo.processadas || corpo.enviados) {
      console.log(`[tick] turnos: ${corpo.processadas ?? 0} · follow-ups: ${corpo.enviados ?? 0}`);
    }
  } catch (err) {
    console.error("[tick] falhou:", err.message);
  }
}

console.log(`[tick] batendo em ${URL_TICK} a cada ${INTERVALO_MS / 1000}s`);
await bater();
setInterval(bater, INTERVALO_MS);
