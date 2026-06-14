# SP2b — Configurações > Funil · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: subagent-driven-development ou executing-plans. Passos em checkbox. **Next 16**: params/cookies async; shadcn sobre Base UI; `@dnd-kit/sortable` p/ lista vertical. Migrations via `npm run migrate`. Server actions admin-only + RLS.

**Goal:** Tela admin `/configuracoes/funil` p/ criar, editar, reordenar (arrastar) e excluir as etapas do funil padrão; excluir bloqueado se a etapa tiver candidatos; etapa da IA achada por marcador estável.

**Architecture:** Reusa `funis`/`funil_etapas` + RLS da SP2. Migration 0014 só adiciona `funil_etapas.marcador`. Lógica pura testável (`aplicarReordenacao` + refine do `etapaSchema`); server actions admin-only; editor client com `@dnd-kit/sortable`. SP3 passa a achar a etapa da IA por marcador.

**Tech Stack:** Next 16 · React 19 · TS · Supabase · @dnd-kit · Zod 4 · Vitest 4 · Base UI.

**Spec:** [docs/superpowers/specs/2026-06-13-sp2b-funil-config-design.md](../specs/2026-06-13-sp2b-funil-config-design.md)

## Conventions
- npm/node em `sapatao-rh/`; git da raiz com paths `sapatao-rh/...` e `docs/...`. Branch `feat/sp2b-funil-config` (de feat/sp3-cv-analise). **cwd do PowerShell reseta — `Set-Location` absoluto p/ sapatao-rh antes de npm/node.**
- TDD na lógica pura. Reusar RLS, `pg` migrate, supabase clients, `getCurrentProfile`, padrão de actions/Dialog/Select, DnD do board.

## File Structure
```
supabase/migrations/0014_funil_etapa_marcador.sql   # add marcador + backfill
supabase/seed.mjs                                    # MODIFY: marcador 'ia_concluida'
types/database.ts                                    # MODIFY: FunilEtapa.marcador
app/api/cv/analyze/route.ts                          # MODIFY: achar etapa IA por marcador
lib/funil/reordenar.ts                               # aplicarReordenacao (TDD)
lib/validations/etapa.ts                             # etapaSchema + refine (TDD)
app/(app)/configuracoes/funil/page.tsx               # tela (server, guard admin)
app/(app)/configuracoes/funil/actions.ts             # criar/atualizar/reordenar/excluir
components/configuracoes/funil-editor.tsx            # lista DnD + ações
components/configuracoes/etapa-form-dialog.tsx       # form criar/editar
components/configuracoes/settings-nav.tsx            # sub-nav Acessos·WhatsApp·Funil
```

---

# Phase A — Migration, seed, types, acoplamento SP3

### Task A1: Migration 0014 + branch
- [ ] `git checkout -b feat/sp2b-funil-config`. Criar `0014_funil_etapa_marcador.sql` (spec §4: add `marcador` + índice único parcial + backfill `ia_concluida`). `npm run migrate`. Verificar (pg) coluna+backfill.
- [ ] Commit `"feat(sp2b): funil_etapas.marcador + backfill ia_concluida"`.

### Task A2: Seed + types
- [ ] `seed.mjs`: no loop de etapas, setar `marcador:'ia_concluida'` na etapa "Análise IA Concluída" (e regravar se faltando). `npm run seed` (2x).
- [ ] `types/database.ts`: `FunilEtapa` + `marcador: string | null`. `tsc` → 0. Commit `"feat(sp2b): seed marcador + FunilEtapa.marcador type"`.

### Task A3: SP3 acha etapa IA por marcador
- [ ] Em `route.ts` `moverParaAnaliseConcluida`: selecionar também `marcador`; `alvo = etapas.find(e=>e.marcador==='ia_concluida') ?? etapas.find(e=>e.nome===ETAPA_ALVO)`. `npm run build`. Commit `"fix(sp2b): SP3 acha etapa IA por marcador (fallback nome)"`.

---

# Phase B — Lógica TDD

### Task B1: aplicarReordenacao
**Files:** `lib/funil/reordenar.test.ts` → `reordenar.ts`
- [ ] **Step 1: Failing test:**
```ts
import { describe, it, expect } from "vitest";
import { aplicarReordenacao } from "./reordenar";
describe("aplicarReordenacao", () => {
  it("move um id para um novo índice preservando o resto", () => {
    expect(aplicarReordenacao(["a","b","c","d"], "a", 2)).toEqual(["b","c","a","d"]);
    expect(aplicarReordenacao(["a","b","c","d"], "d", 0)).toEqual(["d","a","b","c"]);
  });
  it("id inexistente -> inalterado", () => {
    expect(aplicarReordenacao(["a","b"], "x", 0)).toEqual(["a","b"]);
  });
  it("clampa o índice", () => {
    expect(aplicarReordenacao(["a","b","c"], "a", 99)).toEqual(["b","c","a"]);
  });
});
```
- [ ] **Step 2-4:** red → implementar (remove o id, clampa toIndex a [0, len-1], reinsere) → green.
- [ ] **Step 5:** commit `"feat(sp2b): aplicarReordenacao helper [tdd]"`.

### Task B2: etapaSchema + refine
**Files:** `lib/validations/etapa.test.ts` → `etapa.ts`
- [ ] **Step 1: Failing test:** aceita {terminal:true,status_destino:'reprovado'} e {terminal:false,status_destino:null}; rejeita {terminal:true,status_destino:null} e {terminal:false,status_destino:'contratado'}; rejeita cor não-hex e nome vazio.
- [ ] **Step 2-4:** red → `etapaSchema` (spec §6) → green.
- [ ] **Step 5:** commit `"feat(sp2b): etapaSchema + refine terminal/status [tdd]"`.

---

# Phase C — Actions + UI

### Task C1: Server actions
**File:** `app/(app)/configuracoes/funil/actions.ts`
- [ ] `criarEtapa`/`atualizarEtapa`/`reordenarEtapas`/`excluirEtapa` (spec §5), admin-only guard, parse `etapaSchema` (onde aplica), RLS server client, `revalidatePath`. `excluirEtapa`: `count` candidatos com `etapa_id` → `etapa_ocupada` se >0. `reordenarEtapas`: confirmar que os ids são do funil antes de regravar `ordem`.
- [ ] `npm run build`. Commit `"feat(sp2b): funil etapas server actions"`.

### Task C2: Editor DnD + form + sub-nav + página
**Files:** `funil-editor.tsx`, `etapa-form-dialog.tsx`, `settings-nav.tsx`, `configuracoes/funil/page.tsx`; MODIFY acessos/whatsapp pages (sub-nav)
- [ ] `settings-nav.tsx`: links Acessos·WhatsApp·Funil (ativo via pathname). Inserir no topo das 3 páginas.
- [ ] `etapa-form-dialog.tsx`: Dialog Base UI; Input nome, color input cor, number sla_dias, checkboxes is_terminal/requires_confirm, Select status_destino (habilitado só se terminal); submit → criarEtapa/atualizarEtapa; toast + onClose.
- [ ] `funil-editor.tsx` (client): `DndContext`+`SortableContext` (verticalListSortingStrategy); cada etapa = item sortable com cor/nome/badges + Editar/Excluir (Excluir disabled+tooltip se count>0; aviso se marcador ia_concluida). onDragEnd → `aplicarReordenacao` otimista + `reordenarEtapas` (revert+toast no erro). Botão "Nova etapa".
- [ ] `funil/page.tsx` (server, guard admin→redirect): default funil + etapas + contagem por etapa (server a partir de `select etapa_id from candidatos`); render editor + sub-nav.
- [ ] `npm run build` + `tsc` + `npm test` verdes. Commit `"feat(sp2b): funil config page (editor DnD + form + settings nav)"`.

---

# Phase D — Verify & finish

### Task D1: Quality gate
- [ ] `test:cov` (reordenar/etapa ≥60%), `lint` 0, `tsc`, `build` limpos. Commit fixes.

### Task D2: E2E de simulação
- [ ] Throwaway (`supabase/_sim_sp2b.mjs`, deletado): via service role — criar etapa (ordem=max+1), reordenar (regrava ordem), atualizar, tentar excluir etapa ocupada (espera bloqueio replicando a checagem de count), excluir etapa vazia, conferir marcador 'ia_concluida' presente. Limpa.

### Task D3: Adversarial + revisão final + finish
- [ ] Workflow adversarial (lentes: tenant/admin-only nas actions; exclusão segura + ordem consistente; refine + acoplamento marcador/SP3; DnD revert/UX). Corrigir achados reais. Depois **superpowers:finishing-a-development-branch** (provável manter local).

---

## Self-Review (autor)
**Cobertura:** §4 dados→A1,A2; §marcador/SP3→A3; §6 validação→B2; §7 lógica→B1,B2; §5 actions→C1; §8 UI→C2; §10 aceitação→D2,D3.
**Placeholders:** código do core TDD (reordenar/schema) + SQL no plano/spec; UI por responsabilidade+interface (altitude deliberada).
**Consistência de tipos:** `etapaSchema` em B2+C1+C2; `aplicarReordenacao` em B1+C2; `FunilEtapa.marcador` em A2+A3+C2; erros `forbidden`/`etapa_ocupada` em C1+C2.

---
**Fim — Plano SP2b v1.0**
