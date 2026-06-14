# SP3a — Análise de Currículo por IA · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development ou executing-plans. Passos em checkbox (`- [ ]`). **Next 16** (`sapatao-rh/AGENTS.md`): rota com `runtime="nodejs"` p/ pdf-parse; params/cookies async; shadcn sobre Base UI. Migrations via `npm run migrate`. Injeção de dependência espelha `lib/funil/mover.ts`.

**Goal:** Botão "Analisar Currículo" (chat) → extrai texto do CV (PDF/DOCX) → IA mock devolve score+parecer → grava no candidato, move forward p/ "Análise IA Concluída", audita, e exibe o parecer no chat e no funil.

**Architecture:** Núcleo `analisarCurriculo(input, deps)` injetável e 100% unit-testável; `LlmProvider` com provider `mock` determinístico (chave real depois); critérios default por empresa (tabela `ia_criterios` seedada); log em `cv_analises`. Rota `/api/cv/analyze` monta as deps sobre o server client (RLS) + Storage + mock.

**Tech Stack:** Next 16 · React 19 · TS · Supabase (Storage+RLS) · Zod 4 · Vitest 4 · pdf-parse · mammoth · shadcn/Base UI.

**Spec:** [docs/superpowers/specs/2026-06-13-sp3-cv-analise-design.md](../specs/2026-06-13-sp3-cv-analise-design.md)

---

## Conventions
- npm/node em `sapatao-rh/`; git da raiz do repo (`Estação Sapatão - RH`) com paths `sapatao-rh/...` e `docs/...`. Branch: `feat/sp3-cv-analise` (de `feat/sp2-funil`).
- TDD no núcleo (parecer/prompt/mock/extract/analise). Reusar: RLS helpers, `pg` migrate runner, supabase clients, `getCurrentProfile`, `moverCandidato` (forward-only no auto-move), `scoreFaixa`, padrão de deps injetáveis.

## File Structure
```
sapatao-rh/
├── supabase/migrations/0013_ia_cv.sql     # ia_criterios + cv_analises + RLS
├── supabase/seed.mjs                       # MODIFY: linha default de ia_criterios
├── types/database.ts                       # MODIFY: IaCriterios, CvAnalise + Tables (Relationships:[])
├── lib/llm/types.ts                        # LlmProvider
├── lib/llm/mock.ts                         # mock determinístico (TDD)
├── lib/llm/factory.ts                      # getLlmProvider() por env
├── lib/cv/parecer.ts                       # Zod schema + parseParecer (TDD)
├── lib/cv/prompt.ts                        # buildCvPrompt (TDD)
├── lib/cv/criterios.ts                     # getCriterios(empresaId) + DEFAULT
├── lib/cv/extract-text.ts                  # extractCvText(buffer, mime) (TDD)
├── lib/cv/analise.ts                       # analisarCurriculo(input, deps) (TDD, núcleo)
├── lib/validations/cv.ts                   # analyzeSchema { messageId: uuid }
├── app/api/cv/analyze/route.ts             # REPLACE stub: monta deps + chama o núcleo
├── components/cv/parecer-view.tsx          # exibição estruturada do parecer
├── components/chat/message-thread.tsx      # MODIFY: AnalisarCurriculoButton loading/toast
├── components/chat/candidate-panel.tsx     # MODIFY: <ParecerView> quando há parecer
└── components/funil/candidate-modal.tsx    # MODIFY: <ParecerView> no bloco Score IA
```

---

# Phase A — Migration, seed, types, deps

### Task A1: Migration 0013 + branch
- [ ] **Step 1:** `git checkout -b feat/sp3-cv-analise` (de feat/sp2-funil).
- [ ] **Step 2:** Criar `supabase/migrations/0013_ia_cv.sql`: `ia_criterios` (1/empresa, unique index, trigger updated_at) e `cv_analises` (log) conforme spec §5; RLS: `ia_criterios` select tenant / write admin; `cv_analises` select tenant / insert admin+rh. `npm run migrate`. Verificar (pg throwaway) tabelas+RLS.
- [ ] **Step 3:** commit `"feat(sp3): ia_criterios + cv_analises tables + rls"`.

### Task A2: Seed default ia_criterios
- [ ] **Step 1:** Em `seed.mjs`, após o funil, upsert idempotente de 1 linha `ia_criterios` p/ a empresa: `prompt_base` (analista de RH da Estação Sapatão; vagas operacionais Atendente/Frentista/Caixa/Cozinha) + `criterios` (idade≥18; distância/locomoção; veículo; experiência em atendimento; disponibilidade de horário) + `modelo:'mock'`.
- [ ] **Step 2:** `npm run seed` (2x). Commit `"feat(sp3): seed default ia_criterios"`.

### Task A3: Types
- [ ] **Step 1:** Em `types/database.ts` adicionar type aliases `IaCriterios` e `CvAnalise` + entradas em `Tables` com `Relationships: []` (espelhar shape existente).
- [ ] **Step 2:** `npx tsc --noEmit` → 0. Commit `"feat(sp3): db types ia_criterios/cv_analises"`.

### Task A4: Deps
- [ ] **Step 1:** `npm install pdf-parse mammoth` (+ `npm i -D @types/pdf-parse` se existir). Commit `"chore(sp3): add pdf-parse + mammoth"`.

---

# Phase B — Núcleo TDD

### Task B1: parecer.ts (Zod)
**Test:** `lib/cv/parecer.test.ts`
- [ ] **Step 1: Failing test:**
```ts
import { describe, it, expect } from "vitest";
import { parseParecer } from "./parecer";
const valido = JSON.stringify({
  score: 78, verdict: "apto",
  criterios_atendidos: [{ criterio: "Idade ≥18", atendido: true, evidencia: "1998" }],
  pontos_fortes: ["Atendimento"], pontos_atencao: [], experiencia_relevante: "2 anos",
  resumo: "Apto.", perguntas_sugeridas_entrevista: ["Locomoção?"],
});
describe("parseParecer", () => {
  it("aceita o JSON do PRD", () => { expect(parseParecer(valido)?.score).toBe(78); });
  it("rejeita score fora de 0-100", () => { expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), score: 150 }))).toBeNull(); });
  it("rejeita verdict inválido", () => { expect(parseParecer(JSON.stringify({ ...JSON.parse(valido), verdict: "x" }))).toBeNull(); });
  it("rejeita JSON quebrado", () => { expect(parseParecer("{nope")).toBeNull(); });
});
```
- [ ] **Step 2-4:** red → implementar `parecer.ts` (schema da spec §4.3 + `parseParecer` try/JSON.parse/safeParse→null) → green.
- [ ] **Step 5:** commit `"feat(sp3): parecer schema + parse [tdd]"`.

### Task B2: llm mock + factory
**Test:** `lib/llm/mock.test.ts`
- [ ] **Step 1: Failing test:** determinismo (mesma entrada → mesmo score) + `parseParecer(json)` não-nulo + `tokensEst>0`.
```ts
import { describe, it, expect } from "vitest";
import { mockProvider } from "./mock";
import { parseParecer } from "@/lib/cv/parecer";
describe("mockProvider", () => {
  it("é determinístico e retorna parecer válido", async () => {
    const a = await mockProvider.completeJson("s", "curriculo abc");
    const b = await mockProvider.completeJson("s", "curriculo abc");
    expect(a.json).toBe(b.json);
    expect(a.tokensEst).toBeGreaterThan(0);
    expect(parseParecer(a.json)).not.toBeNull();
  });
});
```
- [ ] **Step 2-4:** red → `lib/llm/types.ts` (`LlmProvider`) + `lib/llm/mock.ts` (score por hash estável 35..94; verdict por faixa; parecer plausível; tokensEst=ceil(len/4)) + `lib/llm/factory.ts` (`getLlmProvider()` env `LLM_PROVIDER` default mock; anthropic/openai → throw "não configurado") → green.
- [ ] **Step 5:** commit `"feat(sp3): llm provider interface + mock [tdd]"`.

### Task B3: prompt.ts
**Test:** `lib/cv/prompt.test.ts`
- [ ] **Step 1: Failing test:** o `user` inclui vaga + texto do CV; trunca acima de 12000 chars; o `system` lista os critérios.
- [ ] **Step 2-4:** red → `buildCvPrompt(criterios, vagaInteresse, cvTexto)` (spec §4) → green.
- [ ] **Step 5:** commit `"feat(sp3): cv prompt builder [tdd]"`.

### Task B4: extract-text.ts
**Test:** `lib/cv/extract-text.test.ts` (dispatch com extractores injetados)
- [ ] **Step 1: Failing test:** `extractCvText` chama o extractor de PDF p/ `application/pdf`, o de DOCX p/ docx, e **lança** em mime não suportado; texto vazio → string vazia (o núcleo trata).
```ts
import { describe, it, expect, vi } from "vitest";
import { extractCvText } from "./extract-text";
describe("extractCvText (dispatch)", () => {
  const deps = { pdf: vi.fn(async () => "texto pdf"), docx: vi.fn(async () => "texto docx") };
  it("PDF -> pdf", async () => { expect(await extractCvText(Buffer.from(""), "application/pdf", deps)).toBe("texto pdf"); });
  it("DOCX -> docx", async () => { expect(await extractCvText(Buffer.from(""), "application/vnd.openxmlformats-officedocument.wordprocessingml.document", deps)).toBe("texto docx"); });
  it("mime não suportado lança", async () => { await expect(extractCvText(Buffer.from(""), "image/png", deps)).rejects.toThrow(); });
});
```
- [ ] **Step 2-4:** red → `extractCvText(buffer, mime, deps?)` onde `deps` default usa `pdf-parse`/`mammoth` (lazy import); dispatch por mime limpo; throw em não suportado → green.
- [ ] **Step 5:** commit `"feat(sp3): cv text extraction (pdf/docx) [tdd]"`.

### Task B5: analise.ts (orquestrador) — núcleo
**Test:** `lib/cv/analise.test.ts` (deps mockadas, espelha mover.test)
- [ ] **Step 1: Failing test** cobrindo: sucesso (persist+registrarAnalise(ok)+mover chamados; retorna score/parecer); `arquivo_invalido` (getCvFile→null, sem mover); `texto_vazio` (extractText→""); `ia_indisponivel` (llmJson lança); `parecer_invalido` (json inválido); `persist_falhou` (persist.error≠null → **não** move, log status persist_falhou).
- [ ] **Step 2-4:** red → `analisarCurriculo` (spec §4.2; ordem getCvFile→extractText→getCriterios→buildCvPrompt→llmJson→parseParecer→persist→registrarAnalise→mover best-effort; `safeLog` engole erros) → green.
- [ ] **Step 5:** `lib/cv/criterios.ts` (`getCriterios` + `DEFAULT_CRITERIOS`) e `lib/validations/cv.ts` (`analyzeSchema = z.object({ messageId: z.uuid() })`). Commit `"feat(sp3): analisarCurriculo orchestrator + criterios + validation [tdd]"`.

---

# Phase C — Rota + UI

### Task C1: Rota /api/cv/analyze
**File:** `app/api/cv/analyze/route.ts` (REPLACE)
- [ ] **Step 1:** `export const runtime = "nodejs"`. Auth admin/rh. Parse `analyzeSchema`. Server client (RLS): SELECT da mensagem (`midia_url, midia_mime, conversation_id`) → conversation (`candidato_id`) → candidato (`empresa_id, vaga_interesse, etapa_id`). Se sem anexo/CV mime → 422. Monta `AnaliseDeps`: `getCvFile` (Storage `whatsapp-media` download → Buffer+mime), `extractText`=extractCvText, `getCriterios`, `llmJson`=getLlmProvider().completeJson, `persist` (update candidatos score_ia/parecer_ia), `registrarAnalise` (insert cv_analises com empresa/candidato/message/movido_por), `moverParaAnaliseConcluida` (resolve etapa "Análise IA Concluída" do funil default; forward-only via ordem; reusa `moverCandidato`). Mapear resultado→HTTP (ok 200; arquivo_invalido/texto_vazio 422; ia_indisponivel/parecer_invalido 502; persist_falhou 500).
- [ ] **Step 2:** `npm run build` → sucesso. Commit `"feat(sp3): cv analyze route (mock pipeline)"`.

### Task C2: ParecerView + wiring
**Files:** `components/cv/parecer-view.tsx`; MODIFY chat message-thread, candidate-panel, funil candidate-modal
- [ ] **Step 1:** `parecer-view.tsx` (client): valida `parecer_ia` com `parecerSchema` (defensivo); render score grande (cor `scoreFaixa`), verdict, resumo, critérios (✓/✗+evidência), pontos fortes/atenção, experiência, perguntas. Vazio → "Sem análise ainda".
- [ ] **Step 2:** `AnalisarCurriculoButton`: `useState` loading + `useTransition`; no clique, fetch; `res.ok`→`toast.success("Análise concluída")`+`router.refresh()`; erro→`toast.error(body.message ?? "Falha na análise")`. Desabilita enquanto carrega.
- [ ] **Step 3:** `candidate-panel.tsx` e `candidate-modal.tsx`: substituir o placeholder "Análise/Score IA" por `<ParecerView parecer={candidato.parecer_ia} score={candidato.score_ia} />`. (panel precisa receber `parecer_ia` no Pick; modal já tem o candidato, adicionar `parecer_ia` ao `CandidatoFunil`/loader.)
- [ ] **Step 4:** `npm run build` + `tsc` + `npm test` verdes. Commit `"feat(sp3): parecer view + chat/funil wiring"`.

---

# Phase D — Verify & finish

### Task D1: Quality gate
- [ ] `npm run test:cov` (núcleo cv/llm ≥60%), `npm run lint` (0), `tsc`, `npm run build` — limpos. Commit fixes.

### Task D2: E2E de simulação
- [ ] Throwaway `supabase/_sim_cv.mjs` (deletado depois): via service role, cria candidato + mensagem com anexo apontando p/ um arquivo de teste no bucket (ou injeta texto), roda o pipeline com provider mock pela camada de serviço (ou valida os efeitos: score_ia/parecer_ia preenchidos, cv_analises status ok, candidato movido p/ "Análise IA Concluída"), limpa.

### Task D3: Verificação adversarial + revisão final + finish
- [ ] Workflow adversarial (lentes: tenant/RLS; falha graciosa + persist-antes-de-mover + forward-only; extração/serverless). Corrigir achados reais. Depois **superpowers:finishing-a-development-branch** (provável manter local, padrão das fatias).

---

## Self-Review (autor)
**Cobertura da spec:** §4 arquitetura→B1-B5,C1; §5 dados→A1-A3; §6 rota→C1; §7 UI→C2; §8 erros→B5,C1; §9 testes→B1-B5,D1; §10 aceitação→D2,D3.
**Placeholders:** código completo do núcleo (parecer/mock/extract-dispatch/analise) no plano+spec; UI por responsabilidade+interface (altitude deliberada).
**Consistência de tipos:** `AnaliseDeps`/`AnaliseResult`/`AnaliseErro` em B5+C1; `LlmProvider` em B2+C1; `Parecer`/`parseParecer` em B1,B2,C2; `Criterios`/`getCriterios` em B3,B5,C1; `scoreFaixa` reusado em C2.

---
**Fim — Plano SP3a v1.0**
