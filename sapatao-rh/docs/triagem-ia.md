# Triagem automática e copiloto (SP8)

Três coisas, que compartilham a mesma cota mensal de tokens:

| | O quê | Fala com o candidato? |
|---|---|---|
| **Copiloto** | Chat privado do gestor sobre o candidato aberto | Não |
| **Análise de perfil** | Parecer com score, agora com a fonte de cada afirmação | Não |
| **Triagem** | Atende e qualifica quem chega no WhatsApp | **Sim** |

## Como ligar

1. **Configurações › IA** — chave da OpenAI e critérios (já existia).
2. **Simulador** (`/dev/triagem`) — converse como candidato. Nada é enviado.
   Teste aqui *antes* de ligar. As alavancas laterais forçam cada trava.
3. **Configurações › IA › Triagem automática** — marque "Responder
   automaticamente". Padrão: desligado.

## As sete travas anti-loop

A garantia de que a IA não vira spam é estrutural, não uma instrução de prompt.
Cada trava funciona sozinha; bug numa não derruba as outras.

| # | Trava | Onde |
|---|---|---|
| 1 | Só mensagem recebida dispara resposta | webhook; não existe varredura que fale primeiro |
| 2 | A saída do modelo é UMA string, nunca lista | `lib/triagem/turno.ts` |
| 3 | Claim atômica por conversa | `processando_ate` em `ia_triagem` |
| 4 | Debounce: rajada vira uma resposta só | `responder_em` |
| 5 | Teto de mensagens por hora e por dia | contado no banco, `messages_ia_origem_idx` |
| 6 | Gestor respondeu à mão = IA para de vez | `sender_id` não nulo |
| 7 | Kill switch da empresa | `ia_criterios.triagem_ativa` |

Mais duas, que vieram depois: reentrega do provedor não gera segunda resposta
(compara `ultimo_inbound_em`), e a IA não fala fora do horário configurado.

O **follow-up** é a única mensagem não solicitada do sistema. Sai no máximo uma
por conversa, para sempre — a garantia é a claim `set followup_enviado_em =
now() where followup_enviado_em is null`: quem não escrever a linha não envia.

## Estilo das mensagens

`lib/triagem/estilo.ts` valida toda saída antes de virar mensagem. Reprova
travessão (`—`), markdown, linguagem corporativa, mais de 300 caracteres e mais
de uma pergunta. O travessão e o markdown são consertados automaticamente; o
resto força uma segunda geração. Falhou de novo, a IA fica calada — mensagem com
cara de robô é pior que mensagem nenhuma.

Testes em `estilo.test.ts` e `maquina.test.ts`.

## Worker

`POST /api/ia/tick`, protegido por `IA_TICK_SECRET`. Faz duas coisas: termina
turnos que o webhook não concluiu (reinício de processo) e dispara os
follow-ups. Precisa de um agendador externo a cada ~30s.

```
node scripts/tick.mjs        # dev
```

**Sem agendador o atendimento reativo continua funcionando** — só o follow-up e a
rede de proteção deixam de existir.

## Custo

Mensagem curta ajuda: a saída é pequena, e saída é o token caro.

| | Terra | Luna |
|---|---|---|
| Triagem completa (~8 turnos) | R$ 0,20 | R$ 0,08 |
| Análise de perfil final | R$ 0,15 | R$ 0,06 |
| Pergunta ao copiloto | R$ 0,09 | R$ 0,04 |

Recomendado: `modelo_triagem` = Luna (conversa simples, repetitiva) e o modelo
geral em Terra para a análise, onde a qualidade importa.

## Onde olhar quando algo der errado

- A IA parou numa conversa: veja `ia_triagem.motivo_parada` e a mensagem de
  sistema que ela deixa no próprio chat.
- Consumo: **Configurações › IA › radar de custos** (soma `cv_analises` +
  `ia_uso`).
- O que a IA mandou: mensagens com `metadata->>'origem' = 'ia'`, marcadas com a
  etiqueta "IA" no chat.
