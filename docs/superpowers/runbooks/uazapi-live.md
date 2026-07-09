# Runbook — Conectar a UAZAPI ao vivo (SP1d)

Pré-requisito: conta UAZAPI (URL do servidor, ex. `https://xxxx.uazapi.com`, + admin token).

## Passo a passo
1. Suba tudo local: Docker Desktop → `supabase start` (pasta sapatao-rh) → `npm run dev`.
2. Túnel para o webhook (recebimento): em outro terminal,
   `cloudflared tunnel --url http://localhost:3000`
   (ou `ngrok http 3000`). Copie a URL https gerada.
3. No app (admin): Configurações → WhatsApp.
   a. Bloco **Credenciais UAZAPI**: cole URL do servidor + admin token → Salvar.
   b. Bloco **Conexão**: Conectar → escaneie o QR no WhatsApp do número da empresa
      (Aparelhos conectados → Conectar aparelho). O QR se renova sozinho; aguarde o
      badge ficar "Conectado".
   c. Bloco **Webhook**: cole a URL do túnel → "Salvar e registrar".
4. Teste de fumaça:
   a. De um celular pessoal, mande "olá" para o número conectado.
   b. Veja o evento aparecer em "Últimos eventos recebidos" (recarregue) e a conversa
      na Central de Atendimento (/atendimento).
   c. Responda pela Central e confirme no celular (e o status ✓✓ na UI).
   d. Mande um PDF pelo celular e confirme o anexo na conversa.

## Troubleshooting
- **Evento não aparece no painel** → túnel caiu ou URL errada: suba o túnel, cole a URL
  nova e "Salvar e registrar" de novo (o registro é idempotente).
- **Evento aparece como `ignore`** → o formato real divergiu do parser: expanda o JSON
  bruto no painel, copie e ajuste `lib/uazapi/webhook-parser.ts` (+ teste com esse payload).
- **QR não conecta** → ele expira em ~2 min, mas o polling renova; se travar, Desconectar
  e Conectar de novo.
- **Envio falha com 502** → confira credenciais (bloco 1) e o status "Conectado";
  detalhe do erro fica em `messages.metadata.error`.
- **Trocou de túnel (URL nova a cada sessão do cloudflared free)** → repita apenas o
  passo 3c.
