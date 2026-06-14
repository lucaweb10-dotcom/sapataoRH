# Redesign Visual — Estação Sapatão RH

**Data:** 2026-06-14
**Direção:** A — "Editorial Sereno" (claro, premium, caloroso)
**Tema:** Apenas claro (sem dark mode nesta entrega)
**Tipo:** Camada visual — sem mudança de comportamento, dados, rotas ou RBAC

---

## 1. Objetivo

Elevar a plataforma de um tema shadcn neutro genérico (cinzas, marca subutilizada,
sidebar só-texto, gráficos cinza) para uma linguagem visual **premium, coesa e com
personalidade contida**, inspirada em SaaS de alto desempenho visual (Linear, Notion,
Vercel) com calor editorial.

O redesenho é **puramente visual**: mesma lógica, mesmos dados, mesmas rotas, mesmo
RBAC. Os 188 testes existentes devem continuar passando.

## 2. Direção escolhida

Apresentadas 3 direções no companheiro visual. Usuário escolheu **A — Editorial Sereno**
(claro/caloroso) sobre B (vibrante) e C (dark cockpit). Refinamentos validados:

- **Tema:** apenas claro.
- **Sidebar:** bege editorial (clara), não o verde sólido atual.
- **Identidade Sapatão:** toque de orgulho **sutil** (não vibrante).
- **Entrega:** tudo de uma vez (um passo grande), com testes/lint/build verdes ao final.

## 3. Sistema de design (fundação)

### 3.1 Paleta (tema claro)

| Papel | Token | Hex |
|---|---|---|
| Papel / fundo app | background | `#FAF8F3` |
| Superfície / card | card, popover | `#FFFFFF` |
| Sidebar | sidebar | `#F3F0E8` |
| Verde Sapatão (ação) | primary | `#1C4A2E` |
| Verde claro | — | `#2D6A4F` |
| Acento terracota | accent-terracota | `#CF8A4A` |
| Terracota suave (fundo) | — | `#F8ECD9` |
| Alerta / destrutivo | destructive | `#C0492B` |
| Texto primário | foreground | `#20251F` |
| Texto secundário | muted-foreground | `#5C6157` |
| Texto terciário | — | `#8A8F82` |
| Borda quente | border | `#E7E2D6` |
| Borda input | input | `#D8D2C4` |
| Foco (ring) | ring | `#1C4A2E` |

**Faixas de score IA:** alto → verde (`#E4F0E7`/`#1C4A2E`); médio → âmbar (`#F8ECD9`/`#A9692A`);
baixo → vermelho (`#FBE6DF`/`#C0492B`); sem → neutro (`#EFECE4`/`#6A6F63`).

**Nota sobre acento:** `--accent` do shadcn (fundo de hover em menus/itens) permanece um
neutro quente (`#F1EDE4`). A terracota `#CF8A4A` é um token **separado** de marca
(`--color-sapatao-terracota`), usado em ações de IA e detalhes pontuais — não substitui `--accent`.

**Gráficos (recharts):** chart-1 `#1C4A2E`, chart-2 `#2D6A4F`, chart-3 `#CF8A4A`,
chart-4 `#E0A96D`, chart-5 `#8AA08F`. (Hoje são 5 tons de cinza.)

### 3.2 Tipografia

- **Títulos / display:** Fraunces (serifa premium). Hoje `--font-heading` aponta para
  Archivo em [app/layout.tsx](../../../sapatao-rh/app/layout.tsx) → trocar por Fraunces.
- **Corpo / UI / dados:** Inter (mantida).
- **Números / IDs / mono:** JetBrains Mono (mantida).

### 3.3 Profundidade & forma

- Raio: manter base `--radius: 0.625rem`; cards usam `lg` (~12px), chips/pills arredondados.
- **Sombras quentes** (tom esverdeado-marrom, não cinza-azulado): ex.
  `0 1px 2px rgba(28,40,30,.05)`, hover `0 4px 12px rgba(28,40,30,.08)`.
- Foco: anel verde com halo `0 0 0 3px rgba(28,74,46,.12)`.
- Transições suaves (150–180ms) em hover/estado.

### 3.4 Mapeamento de tokens (globals.css)

Componentes existentes já consomem `bg-sapatao-verde`, `bg-neutro-50`, `text-neutro-900`,
`text-neutro-700`, `border-neutro-200`. Atualizar os tokens **cascateia** para todas as telas:

- `--color-neutro-50` → `#FAF8F3` (papel; usado em `bg-neutro-50` do `<main>`)
- `--color-neutro-200` → `#E7E2D6` (bordas)
- `--color-neutro-700` → `#5C6157` (texto secundário)
- `--color-neutro-900` → `#20251F` (texto primário)
- `--color-sapatao-verde` → `#1C4A2E` (era `#1E4D2B`)
- `--color-sapatao-verde-claro` → `#2D6A4F`
- **novo** `--color-sapatao-terracota` → `#CF8A4A`
- `--color-sapatao-amarelo` mantido (orgulho/acento pontual)

Atualizar também os blocos `:root` (background, foreground, card, primary, secondary,
muted, accent, border, input, ring, sidebar-*, chart-1..5) com os valores da tabela 3.1.

O bloco `.dark` **não é alvo** desta entrega (sem toggle de tema; app permanece claro).

## 4. Componentes `ui/` (compartilhados)

Refinar os primitivos em [components/ui/](../../../sapatao-rh/components/ui/) para o novo
sistema — herdam tokens, então a maior parte vem de graça; ajustes pontuais:

- **button**: variantes primary (verde), secondary (branco/borda), ghost, destructive, e
  nova **accent** (terracota) para ações de IA. Raio 9px, peso 600.
- **badge**: variantes de faixa de score + tag neutra.
- **input / select / label**: borda quente, foco verde com halo.
- **table**: cabeçalho discreto (uppercase, terciário), zebra quente, divisórias suaves.
- **dialog / dropdown-menu / avatar / separator / sonner**: alinhar superfícies, sombras
  e bordas aos tokens.

## 5. Shell

- **Sidebar** ([components/shell/sidebar.tsx](../../../sapatao-rh/components/shell/sidebar.tsx)):
  fundo bege `#F3F0E8`; **logo + marca** ("Sapatão RH" em Fraunces) no topo; cada item com
  **ícone lucide** + label; item ativo = pílula branca com texto verde e sombra sutil; bloco
  do usuário (avatar + nome + papel) no rodapé; **régua fina com gradiente de orgulho** no
  pé da sidebar (toque sutil de identidade).
- **Topbar** ([components/shell/topbar.tsx](../../../sapatao-rh/components/shell/topbar.tsx)):
  seletor de unidade estilizado, botão de ação primário quando aplicável, avatar/nome do
  usuário, sombra/borda sutil. Mantém a lógica atual (signOut, unidade store).

## 6. Telas (polimento, sem mudar comportamento)

- **Dashboard**: saudação em Fraunces; 4 KPIs premium (alerta destacado em terracota/vermelho);
  painéis de entrevistas próximas e candidatos recentes refinados.
- **Funil / Kanban**: colunas em bege; cards de candidato refinados (avatar, chip de score por
  faixa, tags, tempo na etapa, marca de SLA vencido); dialogs (agendar, mover, modal) alinhados.
- **Conversas (chat)**: balões assimétricos (entrada branca com borda / saída verde); lista de
  conversas e composer limpos; painel de candidato lateral consistente.
- **Indicadores**: cards-resumo + funil-snapshot + BarChart recoloridos para a paleta.
- **Candidatos / Funcionários**: tabelas com o novo estilo, chips de etapa/score.
- **Login** ([app/(auth)/login](../../../sapatao-rh/app/(auth)/login/page.tsx)): tela de entrada
  premium com a marca e a régua de orgulho sutil (primeira impressão).
- **Configurações** (Acessos, Funil, WhatsApp): nav lateral interna + formulários consistentes.
- **coming-soon / page-container**: alinhar ao sistema.

## 7. Identidade Sapatão (sutil)

Uma **régua fina com gradiente de orgulho** (faixa discreta, ~2–3px) aplicada em **dois**
pontos de respiro: rodapé da sidebar e tela de login. Sem elementos vibrantes no corpo das
telas — coerente com a escolha pela direção contida (A, não B).

## 8. Escopo & não-objetivos

**Inclui:** tokens em globals.css, fontes (Fraunces), componentes `ui/`, shell (sidebar/topbar),
polimento de todas as telas listadas, recoloração dos gráficos recharts, régua de orgulho sutil.

**NÃO inclui:** regras de negócio, modelo de dados, migrations, rotas, RBAC, server actions,
comportamento de realtime/IA/WhatsApp, dark mode, troca de biblioteca de componentes.

**Invariante:** os 188 testes continuam passando. Se algum quebrar por asserção puramente
visual (ex.: classe de cor), o ajuste é só no teste, justificado.

## 9. Estratégia de implementação (tudo de uma vez)

Ordem lógica dentro de um único passo de implementação:

1. **Fundação**: tokens em globals.css + fonte Fraunces em layout.tsx.
2. **Primitivos**: componentes `ui/`.
3. **Shell**: sidebar (bege, ícones, logo, usuário, régua) + topbar.
4. **Telas**: dashboard → funil → chat → indicadores → tabelas → login → configurações.
5. **Gráficos**: paleta recharts.
6. **Régua de orgulho** nos pontos definidos.

## 10. Verificação

- `npm run test` → 188 testes verdes (ou ajustes visuais justificados).
- `npm run lint` → sem erros.
- `npm run build` → compila.
- Conferência visual no app rodando (`npm run dev`) nas telas-chave: login, dashboard,
  funil, chat, indicadores, candidatos, configurações.

## 11. Riscos & mitigações

- **Contraste/acessibilidade**: validar contraste de texto sobre papel/verde (alvo AA).
- **Tokens compartilhados**: mudar `--color-neutro-*` afeta tudo — é desejado, mas revisar
  telas após a troca para regressões de legibilidade.
- **Fraunces (peso/opsz)**: garantir carregamento correto via next/font e fallback.
- **Testes acoplados a cor**: localizar asserts que checam classes/cores antes de trocar.
