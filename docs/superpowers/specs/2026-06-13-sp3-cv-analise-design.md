# SP3a — Análise de Currículo por IA · Design (Spec)

**Data:** 2026-06-13 · **Módulo:** SP3a (primeira fatia do módulo IA) · **Branch alvo:** `feat/sp3-cv-analise`

## 1. Objetivo

Acionar **"Analisar Currículo"** numa mensagem do chat com anexo → extrair o texto do CV → uma **IA (mockável)** devolve um **score (0–100) + parecer estruturado** → gravar no candidato (`score_ia`/`parecer_ia`), **mover o card para "Análise IA Concluída"** (sem retroceder), registrar auditoria, e **exibir o parecer** no painel do chat e no modal do funil. Notifica o recrutador (toast).

Meta de negócio (PRD §4/§7.5): reduzir o tempo de triagem; "IA não decide, IA acelera" — o humano valida.

## 2. Escopo

### Entra (SP3a)
- Pipeline completo: **download (Storage) → extração (PDF/DOCX) → prompt → LLM (mock) → validação Zod → persistência → move forward → auditoria → toast**.
- **LLM mockável**: provider `mock` determinístico; chave real (Anthropic/OpenAI) plugada **depois** via `.env.local`.
- **Critérios default por empresa** (tabela seedada, editável depois); `vaga_interesse` do candidato injetado como contexto.
- Formatos: **PDF + DOCX**.
- Gatilho: **botão do chat** (já existe; hoje chama o stub).
- **Visualização do parecer** no painel do chat e no modal do funil.

### Fica para depois (SP3b / outros)
- OCR de imagens (Tesseract) + `.doc` legado.
- **Configurações > IA**: editar critérios + contador de custo/tokens.
- Critérios **por vaga** (depende do módulo Vagas).
- Plugar provider real (Anthropic/OpenAI).
- Notificação por badge persistente (além do toast).

## 3. Decisões de design (do brainstorming)
1. **LLM mockável + simulação** — consistente com o padrão do projeto (UAZAPI também foi simulada). Cliente injetável e testável.
2. **Critérios default por empresa, editáveis** — guardados em tabela (`ia_criterios`), seedados com os filtros da Estação Sapatão. Edição via UI fica para SP3b.
3. **Extração PDF + DOCX** — cobre a maioria dos currículos via WhatsApp; imagens/.doc com mensagem acionável "envie em PDF".

## 4. Arquitetura

Camadas pequenas e testáveis, com **injeção de dependência** (espelha `lib/funil/mover.ts`). O LLM, a extração e a persistência são injetados, então o núcleo (`analisarCurriculo`) é 100% unit-testável.

```
sapatao-rh/
├── lib/llm/
│   ├── types.ts          # LlmProvider interface + LlmResult
│   ├── mock.ts           # provider determinístico (sem rede)
│   └── factory.ts        # getLlmProvider() por env (LLM_PROVIDER, default 'mock')
├── lib/cv/
│   ├── extract-text.ts   # extractCvText(buffer, mime) — pdf-parse / mammoth (TDD)
│   ├── criterios.ts      # getCriterios(empresaId) — lê ia_criterios (RLS)
│   ├── prompt.ts         # buildCvPrompt(criterios, vagaInteresse, cvTexto) (TDD)
│   ├── parecer.ts        # Zod schema do parecer + parseParecer(json) (TDD)
│   └── analise.ts        # analisarCurriculo(input, deps) — orquestrador (TDD, núcleo)
├── app/api/cv/analyze/route.ts   # substitui o stub 501: monta deps e chama o orquestrador
├── components/cv/parecer-view.tsx # exibição estruturada do parecer (reutilizada)
├── supabase/migrations/0013_ia_cv.sql      # ia_criterios + cv_analises + RLS
└── supabase/seed.mjs (MODIFY)              # linha default de ia_criterios da empresa
```

### 4.1 LlmProvider (interface)
```ts
export interface LlmProvider {
  readonly modelo: string;
  /** Retorna texto JSON do modelo + estimativa de tokens. Lança em falha de rede/timeout. */
  completeJson(system: string, user: string): Promise<{ json: string; tokensEst: number }>;
}
```
- `mock.ts`: retorna um parecer **determinístico e válido** (deriva um score estável a partir do texto — ex.: comprimento/keywords — para parecer realista, mas sem aleatoriedade), `tokensEst` estimado por `Math.ceil(chars/4)`. Sem rede.
- `factory.ts`: `getLlmProvider()` lê `LLM_PROVIDER` (`mock` default). `anthropic`/`openai` reservados (lançam "não configurado" até SP3b). **Nenhuma chave necessária agora.**

### 4.2 Orquestrador
```ts
export interface AnaliseDeps {
  getCvFile: (path: string) => Promise<{ buffer: Buffer; mime: string } | null>;
  extractText: (buffer: Buffer, mime: string) => Promise<string>;     // lança em formato/erro
  getCriterios: (empresaId: string) => Promise<Criterios>;            // default se ausente
  llmJson: (system: string, user: string) => Promise<{ json: string; tokensEst: number }>;
  persist: (candidatoId: string, score: number, parecer: Parecer) => Promise<{ error: unknown | null }>;
  registrarAnalise: (row: AnaliseLog) => Promise<{ error: unknown | null }>;
  moverParaAnaliseConcluida: (candidatoId: string) => Promise<void>;  // forward-only; best-effort
}
export type AnaliseResult =
  | { ok: true; score: number; parecer: Parecer }
  | { ok: false; error: "arquivo_invalido" | "texto_vazio" | "ia_indisponivel" | "parecer_invalido" | "persist_falhou" };

export async function analisarCurriculo(
  input: { empresaId: string; candidatoId: string; messageId: string; cvPath: string; vagaInteresse: string | null; movidoPor: string },
  deps: AnaliseDeps,
): Promise<AnaliseResult>;
```
Ordem: getCvFile (→arquivo_invalido se null) → extractText (lança→arquivo_invalido; vazio→texto_vazio) → getCriterios → buildCvPrompt → llmJson (lança→ia_indisponivel) → parseParecer (falha→parecer_invalido) → persist (erro→persist_falhou) → registrarAnalise (best-effort) → moverParaAnaliseConcluida (best-effort, forward-only) → ok. **Persistência antes do move**; move e log nunca derrubam um resultado já gravado.

### 4.3 Parecer (schema Zod — espelha o JSON do PRD §7.5)
```ts
const parecerSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["apto", "atencao", "inapto"]),
  criterios_atendidos: z.array(z.object({
    criterio: z.string(), atendido: z.boolean(), evidencia: z.string(),
  })).max(20),
  pontos_fortes: z.array(z.string()).max(10),
  pontos_atencao: z.array(z.string()).max(10),
  experiencia_relevante: z.string(),
  resumo: z.string(),
  perguntas_sugeridas_entrevista: z.array(z.string()).max(10),
});
```
`score_ia` = `parecer.score`; `parecer_ia` = objeto inteiro (jsonb). O badge do funil já usa `scoreFaixa(score_ia)`.

## 5. Dados (migration 0013) — `score_ia`/`parecer_ia` já existem em `candidatos`

`ia_criterios` (1 por empresa):
```sql
create table public.ia_criterios (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  prompt_base text not null,
  criterios jsonb not null default '[]',
  modelo text not null default 'mock',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index ia_criterios_empresa_uq on public.ia_criterios(empresa_id);
-- RLS: select tenant; write admin (mesma forma de funis)
```

`cv_analises` (auditoria/log; base do contador de custo SP3b):
```sql
create table public.cv_analises (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  candidato_id uuid not null references public.candidatos(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  score int, parecer jsonb, modelo text, tokens_est int,
  status text not null,           -- 'ok' | 'arquivo_invalido' | 'texto_vazio' | 'ia_indisponivel' | 'parecer_invalido' | 'persist_falhou'
  movido_por uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index cv_analises_candidato_idx on public.cv_analises(candidato_id, created_at desc);
-- RLS: select tenant; insert admin/rh
```

**Seed:** uma linha `ia_criterios` para a Estação Sapatão (idempotente) com `prompt_base` (instruções de avaliação como Atendente/Frentista/Caixa) e `criterios` (idade≥18, distância até a unidade, veículo/locomoção, experiência em atendimento ao público, disponibilidade de horário).

## 6. Rota `/api/cv/analyze` (substitui o stub)
- Auth: **admin/rh** (já no stub).
- Body: `{ messageId: string (uuid) }`.
- Resolve a mensagem (RLS): `midia_url` (path no bucket `whatsapp-media`), `midia_mime`, `conversation_id` → candidato (`candidato_id`, `empresa_id`, `vaga_interesse`). Se a mensagem não tem anexo de CV → 422.
- Monta `AnaliseDeps` sobre o **server client (RLS)** + Storage (`download`) + `getLlmProvider()`. `moverParaAnaliseConcluida` reusa `moverCandidato` (forward-only: só move se a ordem da etapa atual < ordem de "Análise IA Concluída").
- Chama `analisarCurriculo`; mapeia o resultado para HTTP: `ok`→200 `{score, parecer}`; `arquivo_invalido|texto_vazio`→422; `ia_indisponivel|parecer_invalido`→502; `persist_falhou`→500. Mensagens acionáveis em PT.

## 7. UI
- `components/cv/parecer-view.tsx`: render estruturado — score grande (cor via `scoreFaixa`), verdict, resumo, listas (critérios atendidos com ✓/✗ + evidência, pontos fortes, pontos de atenção, experiência), perguntas sugeridas. Estado "sem análise" quando `parecer_ia` é null.
- **Chat** (`message-thread.tsx`): o `AnalisarCurriculoButton` ganha **loading** + trata status: sucesso→`toast.success` + `router.refresh()`; 4xx/5xx→`toast.error` com a mensagem do servidor. O painel do chat (`candidate-panel.tsx`) passa a mostrar `<ParecerView>` quando há `parecer_ia`.
- **Funil** (`candidate-modal.tsx`): o bloco "Score IA (SP3)" passa a renderizar `<ParecerView>` quando há `parecer_ia` (substitui "Análise disponível no SP3").

## 8. Tratamento de erros (falha graciosa — §7.5)
| Situação | Resultado | HTTP |
|---|---|---|
| Mensagem/arquivo ausente ou não é CV | `arquivo_invalido` | 422 |
| Texto extraído vazio/ilegível | `texto_vazio` | 422 |
| LLM lança (rede/timeout) | `ia_indisponivel` | 502 |
| JSON da IA inválido (schema) | `parecer_invalido` | 502 |
| Falha ao gravar no candidato | `persist_falhou` | 500 |
| Não admin/rh | — | 403 |

Move e log são **best-effort**: nunca transformam um parecer já gravado em erro. Botão com loading; toasts acionáveis.

## 9. Testes (TDD)
- `lib/cv/analise.test.ts` (núcleo): sucesso (persist+log+move chamados); `arquivo_invalido` quando getCvFile→null; `texto_vazio` quando extractText→""; `ia_indisponivel` quando llmJson lança; `parecer_invalido` quando JSON falha no schema; `persist_falhou` quando persist retorna erro (e **não** move/loga como ok); tenant (candidato de outra empresa → não processa).
- `lib/cv/parecer.test.ts`: parseParecer aceita o JSON do PRD; rejeita score fora de 0–100, verdict inválido, campos faltando.
- `lib/cv/prompt.test.ts`: o prompt inclui critérios, `vaga_interesse` e o texto do CV; trunca CV muito longo.
- `lib/cv/extract-text.test.ts`: dispatch por mime (PDF→pdf-parse, DOCX→mammoth, outro→lança), com extractores injetados/mockados; texto vazio é sinalizado.
- `lib/llm/mock.test.ts`: determinístico (mesma entrada → mesmo score), retorna JSON válido pelo schema.
- Depois do verde: **quality gate** (tsc/lint/build/test:cov ≥60% no núcleo) + **verificação adversarial por workflow** (tenant, falha graciosa, forward-only, persist-antes-de-mover) + **E2E de simulação** (rota com provider mock contra o DB/Storage reais) + revisão final.

## 10. Critérios de aceitação
- Clicar "Analisar Currículo" num PDF/DOCX → em segundos, o candidato recebe `score_ia` + `parecer_ia`, move para "Análise IA Concluída" (se ainda não passou), e o parecer aparece no chat e no funil.
- Formato não suportado / texto ilegível / IA fora → mensagem acionável, sem corromper o candidato.
- Tudo com provider **mock** (sem chave); plugar a chave real depois não muda o fluxo.
- `npm run build`, `tsc`, `lint`, testes verdes.

## 11. Riscos / notas
- `pdf-parse`/`mammoth` em ambiente serverless do Next 16 (Turbopack): validar import no build; se `pdf-parse` exigir `Buffer`/Node runtime, marcar a rota como `runtime = "nodejs"`.
- O mock precisa ser plausível para a UI ficar convincente na demo (score variável por candidato, parecer coerente).
- `parecer_ia` é `Record<string, unknown>` no tipo atual — o `ParecerView` valida/normaliza antes de renderizar (defensivo contra dados antigos).
