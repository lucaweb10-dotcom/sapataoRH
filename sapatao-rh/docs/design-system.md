# Design System — Sapatão RH

Identidade: verde de marca `#1c4a2e`, papel `#faf8f3`, Fraunces nos títulos, terracota como
acento. Tudo abaixo existe para manter isso consistente sem ninguém precisar decorar hex.

## Regra de ouro — três camadas, nesta ordem

1. **Token semântico** — `bg-card`, `text-muted-foreground`, `border-border`, `text-danger`.
   É o que você deve usar em tela.
2. **Escala de marca** — `bg-brand-500`, `text-neutro-50`. Só dentro de `components/ui/*` ou
   quando o valor é deliberadamente fixo (ex.: texto claro sobre o verde escuro).
3. **Valor cru** — `#fff`, `bg-red-500`, `text-[13px]`. **Nunca.**

Não existe mais nenhuma classe da paleta padrão do Tailwind (`red-`, `amber-`, `slate-`…) nem
`bg-white` no projeto. Se você precisar de uma cor que não está aqui, o certo é adicionar um
token em `app/globals.css`, não uma classe avulsa.

## Cores

| Papel | Token | Claro |
|---|---|---|
| Canvas (fundo da página) | `bg-background` | `#faf8f3` |
| Superfície (card, popover) | `bg-card` / `bg-popover` | `#ffffff` |
| Superfície 2 (hover, zebra) | `bg-muted` | `#f1ede4` |
| Texto principal | `text-foreground` | `#20251f` |
| Texto secundário | `text-muted-foreground` | `#5c6157` |
| Borda sutil / padrão / forte | `border-border-subtle` · `border-border` · `border-border-strong` | `#f1ede4` · `#e7e2d6` · `#d8d2c4` |
| Ação primária | `bg-primary` | `#1c4a2e` |

Status — cada um tem o par `-soft` (fundo) e `-foreground` (texto sobre o soft):
`success` (verde da marca), `warning` (terracota), `danger`, `info`.

```tsx
<span className="rounded-full bg-warning-soft px-2 text-warning-foreground">inativo</span>
<p className="text-danger">Falha ao enviar.</p>
```

O tema escuro (`.dark`) é verde-noite e já está mapeado. Ainda não há toggle na UI, mas telas
novas escritas com tokens vão funcionar quando ligarmos.

## Tipografia

| Uso | Classe | Tamanho |
|---|---|---|
| Título de página | `font-display text-display font-bold` | 28px, Fraunces |
| Título de seção / card | `font-display text-section font-semibold` | 18px, Fraunces |
| Corpo | `text-sm` | 14px |
| Corpo menor / label | `text-small` | 13px |
| Legenda, metadado | `text-caption` | 12px |
| Micro (tag, timestamp) | `text-micro` | 11px |

Nada de `text-[10px]` avulso. Números (KPI, datas, contadores) usam `tabular`.

## Elevação, raio e movimento

- Sombras: `shadow-xs` card em repouso · `shadow-sm` card com hover · `shadow-md` popover e
  dropdown · `shadow-lg` modal. São quentes (tinta verde-terra), nunca cinza-azuladas.
- Raio: `rounded-lg` (10px) em controles · `rounded-xl` (14px) em cards · `rounded-2xl` (18px)
  em modais · `rounded-full` em pills.
- Movimento: `duration-200 ease-soft` em hover de card e transições de estado.

## Densidade

Controles têm 40px (`default`) e 36px (`sm`). Célula de tabela é `px-4 py-3`. Página é
`max-w-page` (88rem) centralizada — via `PageContainer`, não repita.

## Componentes — use, não recrie

Layout: `PageContainer` · `PageHeader` · `Section`
Superfície: `Card` (+ `CardHeader/Title/Description/Action/Content/Footer`) · `StatCard`
Estado: `EmptyState` · `Skeleton`, `SkeletonText`, `SkeletonTable`
Dados: `Table` (**a moldura já vem embutida — não embrulhe num `<div>` com borda**)
Controles: `Button` · `Input` · `Select` · `Label` · `Badge` · `Tabs` · `Tooltip` ·
`Dialog` · `DropdownMenu` · `Avatar` · `Separator`

## Ao criar uma tela nova

1. `PageContainer` → `PageHeader` → conteúdo em `Section`.
2. Lista vazia? `EmptyState` com uma ação de saída — nunca um `<p>` solto.
3. Rota nova? Crie o `loading.tsx` com skeleton junto (veja `app/(app)/funcionarios/loading.tsx`).
4. Variação nova de um componente entra por `cva` + token, nunca por classe hardcoded na tela.
