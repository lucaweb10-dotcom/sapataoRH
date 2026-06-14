# SP2b — Configurações > Funil (editar etapas) · Design (Spec)

**Data:** 2026-06-13 · **Branch alvo:** `feat/sp2b-funil-config` (de `feat/sp3-cv-analise`)

## 1. Objetivo
Tela admin em `/configuracoes/funil` para **criar, editar, reordenar (arrastar) e excluir** as etapas do funil padrão da empresa — hoje elas só existem via seed. Reaproveita as tabelas `funis`/`funil_etapas` + RLS (write admin) já criadas na SP2.

## 2. Escopo
**Entra:** CRUD das etapas do funil padrão — criar; editar (nome, cor, `sla_dias`, `is_terminal`, `requires_confirm`, `status_destino`); reordenar por DnD; excluir (**bloqueado se houver candidatos** na etapa). Marcador estável p/ a etapa da IA. Sub-navegação entre as páginas de Configurações.
**Fora:** múltiplos funis por empresa (YAGNI — só o padrão); critérios por-vaga; mover candidatos em massa; editar candidatos.

## 3. Decisões (do brainstorming)
1. **Reordenar = DnD** (`@dnd-kit/sortable`, já instalado), consistente com o Kanban.
2. **Excluir = bloquear se ocupada** (etapa com candidatos não pode ser excluída; admin move antes). Evita candidatos órfãos.
3. **Etapa da IA = marcador estável**: nova coluna `funil_etapas.marcador`; a auto-movimentação da SP3 passa a achar por `marcador='ia_concluida'` (fallback nome). Admin pode renomear sem quebrar a IA.

## 4. Dados (migration 0014 — sem tabela nova)
```sql
alter table public.funil_etapas add column if not exists marcador text;
create unique index if not exists funil_etapas_marcador_uq
  on public.funil_etapas(funil_id, marcador) where marcador is not null;
-- backfill: a etapa "Análise IA Concluída" de cada funil recebe o marcador
update public.funil_etapas set marcador = 'ia_concluida'
  where nome = 'Análise IA Concluída' and marcador is null;
```
- `types/database.ts`: `FunilEtapa` ganha `marcador: string | null`.
- `seed.mjs`: ao criar a etapa "Análise IA Concluída", setar `marcador:'ia_concluida'` (idempotente).
- **Acoplamento SP3:** `app/api/cv/analyze/route.ts` `moverParaAnaliseConcluida` busca a etapa por `marcador='ia_concluida'`; se nenhuma, fallback por `nome='Análise IA Concluída'`; se ainda nenhuma, no-op (já tratado).

## 5. Server actions (`app/(app)/configuracoes/funil/actions.ts`, `"use server"`, admin-only + RLS)
Guard: `profile.platform_admin || profile.role==='admin'`; senão `{ ok:false, error:'forbidden' }`.
- `criarEtapa(input)` — valida `etapaSchema`; `ordem = (max(ordem do funil) ?? 0) + 1`; insert. Retorna `{ok}`.
- `atualizarEtapa(etapaId, input)` — valida; update nome/cor/sla_dias/is_terminal/requires_confirm/status_destino.
- `reordenarEtapas(funilId, idsOrdenados)` — valida que os ids pertencem ao funil; regrava `ordem` 1..N.
- `excluirEtapa(etapaId)` — conta candidatos com `etapa_id=etapaId`; se `>0` → `{ok:false,error:'etapa_ocupada'}`; senão delete → `{ok:true}`.
Todas: `revalidatePath('/configuracoes/funil')` no sucesso. Tenant carimbado da própria empresa (RLS força).

## 6. Validação (`lib/validations/etapa.ts`, Zod)
```ts
export const etapaSchema = z.object({
  nome: z.string().min(1).max(60),
  cor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  sla_dias: z.number().int().min(0).max(365).nullable(),
  is_terminal: z.boolean(),
  requires_confirm: z.boolean(),
  status_destino: z.enum(["contratado", "reprovado", "desistente"]).nullable(),
}).refine(
  (e) => (e.is_terminal ? e.status_destino !== null : e.status_destino === null),
  { message: "Etapa terminal exige status_destino; não-terminal exige null", path: ["status_destino"] },
);
```

## 7. Lógica testável (TDD)
- `lib/funil/reordenar.ts` — `aplicarReordenacao(ids, fromId, toIndex)`: remove `fromId` e o reinsere em `toIndex`, retornando a nova ordem de ids (puro). Edge: id inexistente → lista inalterada; toIndex clamped.
- O **refine** do `etapaSchema`: aceita terminal+status / não-terminal+null; rejeita terminal+null e não-terminal+status.

## 8. UI
- `app/(app)/configuracoes/funil/page.tsx` (server, guard admin → redirect /dashboard): carrega o funil padrão + etapas (ordenadas) + **contagem de candidatos por etapa** (`select etapa_id, count` agrupado); renderiza `<FunilEditor>`.
- `components/configuracoes/funil-editor.tsx` (client): lista `@dnd-kit/sortable` das etapas; cada linha: bolinha de cor, nome, badges (Terminal/Confirma/SLA Nd), botões Editar e Excluir (Excluir `disabled` + tooltip "mova os candidatos antes" quando `count>0`). Botão "Nova etapa". DnD `onDragEnd` → `aplicarReordenacao` (otimista) + `reordenarEtapas` (revert + toast no erro).
- `components/configuracoes/etapa-form-dialog.tsx` (client): `<Dialog>` Base UI com Input (nome), color input (cor), number (sla_dias), checkboxes (is_terminal, requires_confirm), Select (status_destino, habilitado só quando terminal). Cria/edita via actions; toast.
- `components/configuracoes/settings-nav.tsx`: sub-nav (Acessos · WhatsApp · Funil) no topo das 3 páginas de Configurações (hoje inexistente). Adicionar nas páginas acessos/whatsapp/funil.

## 9. Erros / segurança
Admin-only (guard + RLS). `etapa_ocupada` → toast acionável. `forbidden` → toast. Excluir a etapa `ia_concluida` (se vazia) é permitido e só desativa a auto-movimentação da IA (rota SP3 trata alvo ausente) — com aviso visual ("etapa usada pela IA"). DnD com revert otimista (padrão do Kanban).

## 10. Critérios de aceitação
- Admin cria/edita/reordena (arrastando)/exclui etapas; mudanças aparecem no quadro `/funil`.
- Excluir etapa ocupada é bloqueado com mensagem clara.
- Renomear a etapa marcada `ia_concluida` **não** quebra a auto-movimentação da SP3.
- Terminal exige status_destino; não-terminal proíbe.
- Não-admin não acessa a página nem as actions.
- `tsc`, `lint`, `build`, testes verdes.

## 11. Riscos / notas
- DnD numa lista vertical (sortable) é diferente do board (droppables por coluna) — usar `SortableContext` + `verticalListSortingStrategy`.
- A contagem por etapa: uma query agregada (ou `count` por etapa via RPC simples / `select etapa_id` e contar no server). Para o MVP, contar no server a partir de `select etapa_id from candidatos where empresa_id=…`.
- `status_destino` é livre no schema mas restrito pelo CHECK (0012) — o Select já o limita aos 3 válidos.
