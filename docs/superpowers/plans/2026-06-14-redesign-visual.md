# Redesign Visual (Direção A — Editorial Sereno) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transformar a UI da plataforma Estação Sapatão RH num visual premium claro e caloroso ("Editorial Sereno"), trocando o tema shadcn neutro por um sistema de tokens de marca, sem alterar comportamento, dados ou rotas.

**Architecture:** Token-first. A maior parte do redesenho cascateia ao atualizar `app/globals.css` (escalas `neutro`/`brand` completas + tokens shadcn quentes + cores de gráfico) e a fonte de títulos em `app/layout.tsx`. Em cima disso, mudanças estruturais pontuais na sidebar (ícones, logo, bloco de usuário, régua de orgulho), topbar, gráficos recharts (cores hardcoded), login, e recoloração de chips de status. Tema **apenas claro** (sem toggle; bloco `.dark` permanece intocado).

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4 (`@theme`), shadcn + Base UI, lucide-react 1.18, recharts 3, next/font (Fraunces + Inter + JetBrains Mono).

**Invariante:** os 188 testes (`npm run test`) continuam verdes. `npm run lint` e `npm run build` sem erros ao final.

---

## File Structure

**Modificados (fundação):**
- `app/globals.css` — escalas de cor completas + tokens shadcn + cores de gráfico + utilitário `.pride-rule` + sombra quente.
- `app/layout.tsx` — fonte de títulos Archivo → Fraunces.

**Modificados (primitivos / shell):**
- `components/ui/button.tsx` — nova variante `accent` (terracota).
- `components/shell/sidebar.tsx` — reescrita: bege, logo, ícones lucide, bloco de usuário, régua de orgulho.
- `components/shell/topbar.tsx` — refino (avatar compacto + Sair).
- `app/(app)/layout.tsx` — passar `profile` para `<Sidebar>`.

**Modificados (gráficos / status):**
- `components/indicadores/entradas-chart.tsx` — cores hardcoded → paleta de marca.
- `components/indicadores/funil-snapshot.tsx` — `green-700`/`red-600` → tokens.
- `components/funil/candidate-card.tsx` — recolor das faixas de score.
- `components/configuracoes/funil-editor.tsx` — chip âmbar mantido (semântico), verificar.

**Modificados (telas):**
- `app/(auth)/login/page.tsx` — tela de login premium + régua de orgulho.

**Verificação por cascata (sem edição obrigatória):** `dashboard/*`, `funil/board.tsx`, `funil/candidate-modal.tsx`, `chat/*`, `configuracoes/*`, `candidatos/page.tsx`, `funcionarios/page.tsx`, `shared/coming-soon.tsx`, `cv/parecer-view.tsx` — herdam dos tokens; conferir visualmente e aplicar toques pontuais listados na Task 8.

---

## Task 1: Fundação — tokens de cor em globals.css

**Files:**
- Modify: `sapatao-rh/app/globals.css`

- [ ] **Step 1: Substituir o bloco `@theme` (cores de marca) pela escala completa**

Localize o bloco atual (linhas ~52-62, começando em `/* Sapatão — PROVISÓRIO ... */`) e substitua-o inteiro por:

```css
@theme {
  /* Sapatão — Direção A "Editorial Sereno" (tema claro) */

  /* Verde de marca (ação) — escala completa */
  --color-brand-50: #eaf1ec;
  --color-brand-100: #d6e4da;
  --color-brand-200: #b7cfbf;
  --color-brand-300: #8fb39c;
  --color-brand-400: #5c8c6e;
  --color-brand-500: #2d6a4f;
  --color-brand-600: #235a41;
  --color-brand-700: #1c4a2e;
  --color-brand-800: #163d25;
  --color-brand-900: #0f2b1a;

  /* Neutros quentes (papel/taupe/texto) — escala completa */
  --color-neutro-50: #faf8f3;
  --color-neutro-100: #f1ede4;
  --color-neutro-200: #e7e2d6;
  --color-neutro-300: #d8d2c4;
  --color-neutro-400: #b9b4a6;
  --color-neutro-500: #8a8f82;
  --color-neutro-600: #6a6f63;
  --color-neutro-700: #5c6157;
  --color-neutro-800: #3a3f36;
  --color-neutro-900: #20251f;

  /* Acentos de marca */
  --color-sapatao-verde: #1c4a2e;
  --color-sapatao-verde-claro: #2d6a4f;
  --color-sapatao-terracota: #cf8a4a;
  --color-sapatao-laranja: #e85d2f;
  --color-sapatao-amarelo: #ffd500;
}
```

- [ ] **Step 2: Substituir o bloco `:root` (tokens shadcn) pelos valores quentes**

Substitua o bloco `:root { ... }` inteiro (linhas ~64-97) por:

```css
:root {
  --background: #faf8f3;
  --foreground: #20251f;
  --card: #ffffff;
  --card-foreground: #20251f;
  --popover: #ffffff;
  --popover-foreground: #20251f;
  --primary: #1c4a2e;
  --primary-foreground: #faf8f3;
  --secondary: #f1ede4;
  --secondary-foreground: #20251f;
  --muted: #f1ede4;
  --muted-foreground: #5c6157;
  --accent: #f1ede4;
  --accent-foreground: #20251f;
  --destructive: #c0492b;
  --border: #e7e2d6;
  --input: #d8d2c4;
  --ring: #1c4a2e;
  --chart-1: #1c4a2e;
  --chart-2: #2d6a4f;
  --chart-3: #cf8a4a;
  --chart-4: #e0a96d;
  --chart-5: #8aa08f;
  --radius: 0.625rem;
  --sidebar: #f3f0e8;
  --sidebar-foreground: #20251f;
  --sidebar-primary: #1c4a2e;
  --sidebar-primary-foreground: #faf8f3;
  --sidebar-accent: #ffffff;
  --sidebar-accent-foreground: #1c4a2e;
  --sidebar-border: #e7e2d6;
  --sidebar-ring: #1c4a2e;
}
```

Deixe o bloco `.dark { ... }` **intocado** (não é alvo desta entrega).

- [ ] **Step 3: Adicionar utilitários (régua de orgulho + sombra quente) no `@layer base`/novo `@layer components`**

No fim do arquivo, após o bloco `@layer base { ... }`, acrescente:

```css
@layer components {
  /* Régua fina com gradiente de orgulho — toque sutil de identidade */
  .pride-rule {
    height: 3px;
    border-radius: 9999px;
    background: linear-gradient(90deg, #cf8a4a 0%, #ffd500 35%, #3a9e63 70%, #1c4a2e 100%);
    opacity: 0.85;
  }
  /* Sombra quente (tom esverdeado-marrom em vez de cinza-azulado) */
  .shadow-warm {
    box-shadow: 0 1px 2px rgba(28, 40, 30, 0.05), 0 1px 1px rgba(28, 40, 30, 0.04);
  }
  .shadow-warm-md {
    box-shadow: 0 4px 12px rgba(28, 40, 30, 0.08);
  }
}
```

- [ ] **Step 4: Verificar que compila e os testes seguem verdes**

Run: `cd sapatao-rh; npm run test`
Expected: 188 testes PASS (sem regressão).

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/app/globals.css
git commit -m "feat(redesign): tokens de cor Editorial Sereno (escalas neutro/brand + shadcn quente + graficos)"
```

---

## Task 2: Fundação — fonte de títulos Fraunces

**Files:**
- Modify: `sapatao-rh/app/layout.tsx`

- [ ] **Step 1: Trocar Archivo por Fraunces**

Substitua as linhas de import e de fontes (linhas 2 e 5-7) por:

```tsx
import { Inter, Fraunces, JetBrains_Mono } from "next/font/google";

const inter = Inter({ variable: "--font-sans", subsets: ["latin"] });
const fraunces = Fraunces({ variable: "--font-heading", subsets: ["latin"] });
const jetbrainsMono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"] });
```

- [ ] **Step 2: Atualizar a `className` do `<html>` para usar `fraunces.variable`**

Substitua `${archivo.variable}` por `${fraunces.variable}` na `className` (linha ~22). O resultado:

```tsx
className={`${inter.variable} ${fraunces.variable} ${jetbrainsMono.variable} h-full antialiased`}
```

- [ ] **Step 3: Verificar build da fonte**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/app/layout.tsx
git commit -m "feat(redesign): fonte de titulos Fraunces (--font-heading)"
```

---

## Task 3: Primitivo — variante `accent` no Button

**Files:**
- Modify: `sapatao-rh/components/ui/button.tsx:11-20`

- [ ] **Step 1: Adicionar a variante `accent` (terracota) ao `buttonVariants`**

No objeto `variant:` da cva, após a linha `destructive: ...`, acrescente:

```tsx
        accent:
          "bg-sapatao-terracota text-neutro-50 hover:bg-sapatao-terracota/90",
```

- [ ] **Step 2: Verificar testes e lint**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/components/ui/button.tsx
git commit -m "feat(redesign): variante accent (terracota) no Button"
```

---

## Task 4: Shell — Sidebar editorial (bege, ícones, logo, usuário, régua)

**Files:**
- Modify: `sapatao-rh/components/shell/sidebar.tsx`
- Modify: `sapatao-rh/app/(app)/layout.tsx:39`

> Ícones via mapa local `ICONS` keyed por `item.key` (não requer mudança em `rbac.ts`). Mapa lucide (verificados como presentes no pacote 1.18): dashboard→`LayoutDashboard`, chat→`MessagesSquare`, funil→`Columns3`, candidatos→`Users`, funcionarios→`UserRoundCheck`, indicadores→`ChartColumn`, configuracoes→`Settings`. Tipo `LucideIcon` e `Profile` (com `nome`/`role`) confirmados como exportados.

- [ ] **Step 1: Reescrever `sidebar.tsx`**

Substitua o conteúdo inteiro de `components/shell/sidebar.tsx` por:

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MessagesSquare,
  Columns3,
  Users,
  UserRoundCheck,
  ChartColumn,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { navItemsForRole } from "@/lib/auth/rbac";
import type { Profile, Role } from "@/types/database";
import { cn } from "@/lib/utils";

const ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  chat: MessagesSquare,
  funil: Columns3,
  candidatos: Users,
  funcionarios: UserRoundCheck,
  indicadores: ChartColumn,
  configuracoes: Settings,
};

function initials(nome: string): string {
  const parts = nome.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

export function Sidebar({ role, profile }: { role: Role; profile: Profile }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="flex w-60 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="grid size-9 place-items-center rounded-lg bg-brand-700 font-display text-base font-bold text-neutro-50">
          S
        </div>
        <div className="leading-tight">
          <div className="font-display text-base font-bold text-neutro-900">Sapatão</div>
          <div className="text-[11px] font-medium tracking-wide text-neutro-500">RH</div>
        </div>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {items.map((item) => {
          const Icon = ICONS[item.key] ?? LayoutDashboard;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-sidebar-accent text-brand-700 shadow-warm"
                  : "text-neutro-700 hover:bg-neutro-100",
              )}
            >
              <Icon className={cn("size-[18px]", active ? "text-brand-700" : "text-neutro-500")} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 pb-3">
        <div className="flex items-center gap-2.5 rounded-lg border border-sidebar-border bg-card px-3 py-2.5 shadow-warm">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-700 text-xs font-bold text-neutro-50">
            {initials(profile.nome)}
          </div>
          <div className="min-w-0 leading-tight">
            <div className="truncate text-[13px] font-semibold text-neutro-900">
              {profile.nome}
            </div>
            <div className="text-[11px] capitalize text-neutro-500">{profile.role}</div>
          </div>
        </div>
        <div className="pride-rule mx-1 mt-3" />
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Passar `profile` para `<Sidebar>` no layout**

Em `app/(app)/layout.tsx` linha ~39, troque:

```tsx
        <Sidebar role={profile.role} />
```

por:

```tsx
        <Sidebar role={profile.role} profile={profile} />
```

- [ ] **Step 3: Verificar testes, lint**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS. (Se algum teste referenciar a sidebar/`bg-sapatao-verde`, ajustar a asserção visual — ver Task 9.)

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/components/shell/sidebar.tsx "sapatao-rh/app/(app)/layout.tsx"
git commit -m "feat(redesign): sidebar editorial — bege, icones lucide, logo, bloco de usuario, regua de orgulho"
```

---

## Task 5: Shell — Topbar refinada

**Files:**
- Modify: `sapatao-rh/components/shell/topbar.tsx`

- [ ] **Step 1: Refinar a topbar (avatar compacto + Sair; identidade agora vive na sidebar)**

Substitua o bloco `return ( ... )` (linhas ~29-62) por:

```tsx
  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-neutro-200 bg-card px-4 shadow-warm">
      <Select
        value={unidadeId ?? "todas"}
        onValueChange={(v: string | null) =>
          setUnidade(v === "todas" ? null : v)
        }
      >
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Unidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as unidades</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>
              {u.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm font-medium text-neutro-900 sm:inline">
          {profile.nome}
        </span>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">
            Sair
          </Button>
        </form>
      </div>
    </header>
  );
```

(Mantém toda a lógica existente: `useUnidadeStore`, `useEffect`, `signOut`. Apenas estiliza e remove a duplicação do papel/role, que agora aparece na sidebar.)

- [ ] **Step 2: Verificar testes, lint**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/components/shell/topbar.tsx
git commit -m "feat(redesign): topbar refinada (card quente, avatar/nome compacto)"
```

---

## Task 6: Gráficos — recoloração recharts para a paleta de marca

**Files:**
- Modify: `sapatao-rh/components/indicadores/entradas-chart.tsx`
- Modify: `sapatao-rh/components/indicadores/funil-snapshot.tsx`

- [ ] **Step 1: `entradas-chart.tsx` — trocar as cores hardcoded**

Faça estas substituições exatas:
- `stroke="#E5E7EB"` (CartesianGrid) → `stroke="#E7E2D6"`
- ambos `fill: "#6B7280"` (XAxis e YAxis ticks) → `fill: "#8A8F82"`
- `border: "1px solid #E5E7EB"` (Tooltip contentStyle) → `border: "1px solid #E7E2D6"`
- `cursor={{ fill: "#F3F4F6" }}` → `cursor={{ fill: "#F1EDE4" }}`
- `<Bar dataKey="count" fill="#4A7C59" radius={[4, 4, 0, 0]} />` → `<Bar dataKey="count" fill="#1C4A2E" radius={[4, 4, 0, 0]} />`

- [ ] **Step 2: `funil-snapshot.tsx` — status para tokens**

Faça estas substituições exatas:
- `className="text-green-700"` (linha ~46) → `className="text-brand-700"`
- `className={e.sla_fora > 0 ? "font-medium text-red-600" : "text-neutro-700"}` (linha ~48) → `className={e.sla_fora > 0 ? "font-medium text-destructive" : "text-neutro-700"}`

(`text-neutro-400` na linha ~53 agora resolve, pois a escala foi completada na Task 1 — nenhuma mudança necessária.)

- [ ] **Step 3: Verificar testes, lint**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/components/indicadores/entradas-chart.tsx sapatao-rh/components/indicadores/funil-snapshot.tsx
git commit -m "feat(redesign): recharts e snapshot na paleta de marca"
```

---

## Task 7: Tela de Login premium

**Files:**
- Modify: `sapatao-rh/app/(auth)/login/page.tsx`

- [ ] **Step 1: Reescrever o `return` do `LoginPage`**

Substitua o bloco `return ( ... )` (linhas ~12-43) por:

```tsx
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutro-50 p-4">
      <form
        action={formAction}
        className="w-full max-w-sm overflow-hidden rounded-2xl border border-neutro-200 bg-card shadow-warm-md"
      >
        <div className="pride-rule" />
        <div className="space-y-5 p-8">
          <div className="flex flex-col items-center gap-3 text-center">
            <div className="grid size-12 place-items-center rounded-xl bg-brand-700 font-display text-xl font-bold text-neutro-50 shadow-warm">
              S
            </div>
            <div className="space-y-0.5">
              <h1 className="font-display text-2xl font-bold text-brand-700">Sapatão RH</h1>
              <p className="text-sm text-neutro-600">Acesse sua conta</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Senha</Label>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </div>

          {state?.error && (
            <p role="alert" className="text-sm text-destructive">
              {state.error}
            </p>
          )}

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Entrando..." : "Entrar"}
          </Button>
        </div>
      </form>
    </main>
  );
```

> Nota: o erro passou de `text-sapatao-laranja` para `text-destructive` (vermelho de alerta, mais legível para erro). Verifique se algum teste de login asserta o texto/cor do erro — se assertar a classe, ajuste conforme Task 9.

- [ ] **Step 2: Verificar testes, lint**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add "sapatao-rh/app/(auth)/login/page.tsx"
git commit -m "feat(redesign): tela de login premium com regua de orgulho"
```

---

## Task 8: Recolor de chips de status + cascata por tela

**Files:**
- Modify: `sapatao-rh/components/funil/candidate-card.tsx:9-14`
- Verify (sem edição obrigatória): demais telas listadas em File Structure.

- [ ] **Step 1: `candidate-card.tsx` — recolor das faixas de score para a paleta quente**

Substitua o objeto `FAIXA_STYLE` (linhas ~9-14) por:

```tsx
const FAIXA_STYLE: Record<ScoreFaixa, string> = {
  sem: "bg-neutro-100 text-neutro-600",
  baixo: "bg-[#fbe6df] text-[#c0492b]",
  medio: "bg-[#f8ecd9] text-[#a9692a]",
  alto: "bg-brand-50 text-brand-700",
};
```

- [ ] **Step 2: Conferência visual por cascata (rodar o app)**

Run: `cd sapatao-rh; npm run dev` (deixe rodando)

Abra e confira cada tela; os tokens já cascateiam, então o objetivo é detectar contraste ruim ou cor "fora do tom":
- `/login` — card, régua, marca.
- `/dashboard` — saudação Fraunces, KPIs (alerta em vermelho), painéis.
- `/funil` — colunas (`board.tsx`), cards (`candidate-card.tsx`), modal (`candidate-modal.tsx`).
- `/chat` — lista de conversas, thread (balão enviado em verde de marca via `bg-sapatao-verde`), composer.
- `/indicadores` — `resumo-cards` (chips de período agora usam `bg-brand-700` definido), snapshot, BarChart.
- `/candidatos` e `/funcionarios` — tabelas.
- `/configuracoes/acessos|funil|whatsapp` — nav interna (`settings-nav.tsx` usa `border-sapatao-verde`), formulários, `funil-editor` (chip âmbar mantido como semântico).

- [ ] **Step 3: Toques pontuais (apenas se a conferência apontar)**

Se algum ponto destoar, aplique correções mínimas trocando literais por tokens equivalentes (ex.: `text-red-600` → `text-destructive`, `bg-red-50/border-red-200` em `hoje-cards.tsx` já formam o card de alerta — mantenha; `parecer-view.tsx` mantém verde/vermelho/âmbar semânticos do parecer de IA). Não force mudanças onde a cor é semântica e legível.

- [ ] **Step 4: Verificar testes, lint, build**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

Run: `cd sapatao-rh; npm run lint`
Expected: sem erros.

Run: `cd sapatao-rh; npm run build`
Expected: compila sem erros.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(redesign): recolor de faixas de score + ajustes de cascata por tela"
```

---

## Task 9: Ajuste de testes acoplados a cor/classe (se necessário)

**Files:**
- Test: arquivos `*.test.tsx` que assertem classes/cores alteradas (ex.: sidebar, login, candidate-card).

- [ ] **Step 1: Localizar asserts acoplados a cor/classe**

Run: `cd sapatao-rh; npm run test`
Se houver falha, ela virá de asserção puramente visual (ex.: `toHaveClass("bg-sapatao-verde")` na sidebar, ou texto/cor de erro no login).

- [ ] **Step 2: Atualizar apenas a asserção visual para o novo valor**

Para cada falha, ajuste a asserção ao novo estado (ex.: classe da sidebar `bg-sidebar`, cor de erro `text-destructive`). **Não** altere lógica de comportamento; apenas o valor visual esperado. Se um teste verificava comportamento (navegação, RBAC, submit), ele deve permanecer igual e passar.

- [ ] **Step 3: Verificar suíte verde**

Run: `cd sapatao-rh; npm run test`
Expected: 188 PASS.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh
git commit -m "test(redesign): ajustar assercoes visuais ao novo sistema de cores"
```

---

## Verificação final

- [ ] `cd sapatao-rh; npm run test` → 188 PASS.
- [ ] `cd sapatao-rh; npm run lint` → sem erros.
- [ ] `cd sapatao-rh; npm run build` → compila.
- [ ] Conferência visual no app rodando das telas-chave (login, dashboard, funil, chat, indicadores, candidatos, configurações) — coesão, contraste AA, régua de orgulho visível na sidebar e no login.

## Notas de cobertura (spec → plano)

- Tokens/paleta/tipografia/profundidade/gráficos (spec §3) → Tasks 1, 2, 6.
- Componentes `ui/` (spec §4) → Task 3 (variante accent); input/select/table/dialog cascateiam dos tokens (Task 1) e são conferidos na Task 8.
- Shell (spec §5) → Tasks 4, 5.
- Telas (spec §6) → Task 7 (login) + Task 8 (cascata + chips).
- Identidade sutil (spec §7) → régua de orgulho na sidebar (Task 4) e no login (Task 7).
- Escopo/invariante (spec §8) → Tasks 8 (build) e 9 (testes verdes).
