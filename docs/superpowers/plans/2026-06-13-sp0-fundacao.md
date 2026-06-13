# SP0 — Fundação · Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The **superpowers:supabase** skill will activate during DB/Auth tasks — defer to it for current CLI/Dashboard specifics.

**Goal:** Build the foundation of Sapatão RH — a multi-tenant Next.js + Supabase app where an admin logs in, manages internal users/access in Configurações > Acessos, and navigates a role-filtered shell, with every row isolated per `empresa` via RLS.

**Architecture:** Next.js App Router (SSR via `@supabase/ssr`) on top of Supabase Postgres/Auth. Multi-tenant isolation enforced at two layers: RLS policies in Postgres reading `empresa_id`/`role` from JWT claims injected by a Custom Access Token Hook, plus server-side tenant/role re-validation. User creation uses the Supabase service role only in server route handlers.

**Tech Stack:** Next.js (latest stable, App Router) · React 19 · TypeScript · TailwindCSS 4 · shadcn/ui · @supabase/supabase-js · @supabase/ssr · Zod · Zustand · TanStack Query · Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-06-13-sp0-fundacao-design.md](../specs/2026-06-13-sp0-fundacao-design.md)

---

## Conventions

- **Working dir:** all `npm`/`npx` commands run inside `sapatao-rh/` unless stated. Git runs from the repo root (parent).
- **Project ref:** `qysnyiufifgldieqnsly` · **Supabase URL:** `https://qysnyiufifgldieqnsly.supabase.co`
- **Secrets** (anon key, service role, DB password, seed admin password) live ONLY in `sapatao-rh/.env.local` (gitignored). Never hardcode them in committed files. They were provided by the user out-of-band.
- **DB password contains `@`** → URL-encode as `%40` in any connection string (`DB_PASSWORD` → `URLENCODED_PASSWORD`).
- **Tests:** `npm test` runs `vitest run`. Each logic task is TDD: write failing test → run (red) → implement → run (green) → commit.
- **Commits:** small and frequent, conventional-commit style, from repo root.

---

## File Structure (created across this plan)

```
sapatao-rh/
├── app/
│   ├── layout.tsx                      # root layout, fonts, providers
│   ├── globals.css                     # Tailwind 4 + design tokens (@theme)
│   ├── (auth)/login/page.tsx           # login form
│   ├── (auth)/login/actions.ts         # signIn server action
│   ├── (app)/layout.tsx                # shell: sidebar + topbar (role-filtered)
│   ├── (app)/dashboard/page.tsx        # placeholder
│   ├── (app)/chat/page.tsx             # placeholder
│   ├── (app)/funil/page.tsx            # placeholder
│   ├── (app)/candidatos/page.tsx       # placeholder
│   ├── (app)/funcionarios/page.tsx     # placeholder
│   ├── (app)/indicadores/page.tsx      # placeholder
│   ├── (app)/configuracoes/acessos/page.tsx        # FUNCTIONAL: list users
│   ├── (app)/configuracoes/acessos/novo-usuario-form.tsx  # client modal
│   └── api/usuarios/route.ts           # POST create user (service role)
├── components/
│   ├── ui/                             # shadcn components
│   ├── shell/sidebar.tsx
│   ├── shell/topbar.tsx
│   └── shared/coming-soon.tsx
├── lib/
│   ├── supabase/browser.ts
│   ├── supabase/server.ts
│   ├── supabase/admin.ts
│   ├── supabase/middleware.ts
│   ├── auth/rbac.ts                    # pure RBAC helpers (TDD)
│   ├── auth/current-profile.ts         # getCurrentProfile (server)
│   ├── usuarios/create-usuario.ts      # user-creation service (TDD)
│   └── validations/usuarios.ts         # Zod schemas (TDD)
├── stores/unidade-store.ts             # Zustand: selected unidade
├── types/database.ts                   # hand-written DB types (SP0 tables)
├── middleware.ts
├── supabase/
│   ├── config.toml                     # auth hook config
│   ├── migrations/0001_tables.sql
│   ├── migrations/0002_rls_helpers.sql
│   ├── migrations/0003_access_token_hook.sql
│   ├── migrations/0004_rls_policies.sql
│   └── seed.mjs                        # bootstrap (empresa + unidade + admin)
├── lib/auth/rbac.test.ts
├── lib/validations/usuarios.test.ts
├── lib/usuarios/create-usuario.test.ts
├── vitest.config.ts
├── vitest.setup.ts
├── .env.local                          # gitignored
└── .env.example                        # committed
```

---

# Phase A — Scaffold & Tooling

### Task A1: Scaffold the Next.js app

**Files:** Create: `sapatao-rh/` (whole app tree)

- [ ] **Step 1: Scaffold** (run from repo root)

```bash
npx create-next-app@latest sapatao-rh --typescript --tailwind --eslint --app --no-src-dir --import-alias "@/*" --use-npm
```

If prompted (Turbopack), accept defaults. This creates `sapatao-rh/` with Tailwind 4, App Router, no `src/` dir.

- [ ] **Step 2: Verify it runs**

```bash
cd sapatao-rh
npm run dev
```

Expected: dev server on http://localhost:3000 renders the Next starter page. Stop the server (Ctrl+C).

- [ ] **Step 3: Commit** (from repo root)

```bash
git add sapatao-rh
git commit -m "chore(sp0): scaffold next.js app (app router, ts, tailwind 4)"
```

---

### Task A2: Install runtime & dev dependencies

**Files:** Modify: `sapatao-rh/package.json`

- [ ] **Step 1: Install runtime deps** (in `sapatao-rh/`)

```bash
npm install @supabase/supabase-js @supabase/ssr zod zustand @tanstack/react-query
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D vitest @vitejs/plugin-react vite-tsconfig-paths jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/package.json sapatao-rh/package-lock.json
git commit -m "chore(sp0): add supabase, zod, state, and test deps"
```

---

### Task A3: Configure Vitest (test harness) + prove it works

**Files:** Create: `sapatao-rh/vitest.config.ts`, `sapatao-rh/vitest.setup.ts`, `sapatao-rh/lib/__smoke__/smoke.test.ts`; Modify: `sapatao-rh/package.json`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: ["**/*.test.{ts,tsx}"],
    exclude: ["node_modules", ".next"],
    coverage: { provider: "v8", reporter: ["text", "html"] },
  },
});
```

- [ ] **Step 2: Write `vitest.setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add scripts to `package.json`** (merge into `"scripts"`)

```json
"test": "vitest run",
"test:watch": "vitest",
"test:cov": "vitest run --coverage"
```

- [ ] **Step 4: Write a failing smoke test** — `lib/__smoke__/smoke.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { ping } from "./smoke";

describe("test harness", () => {
  it("runs and imports modules", () => {
    expect(ping()).toBe("pong");
  });
});
```

- [ ] **Step 5: Run it — expect FAIL**

```bash
npm test
```

Expected: FAIL — cannot find module `./smoke`.

- [ ] **Step 6: Create `lib/__smoke__/smoke.ts`**

```ts
export function ping(): "pong" {
  return "pong";
}
```

- [ ] **Step 7: Run it — expect PASS**

```bash
npm test
```

Expected: 1 passed.

- [ ] **Step 8: Commit**

```bash
git add sapatao-rh/vitest.config.ts sapatao-rh/vitest.setup.ts sapatao-rh/package.json sapatao-rh/package-lock.json sapatao-rh/lib/__smoke__
git commit -m "test(sp0): configure vitest + testing-library harness"
```

---

### Task A4: Environment files

**Files:** Create: `sapatao-rh/.env.example` (committed), `sapatao-rh/.env.local` (gitignored)

- [ ] **Step 1: Write `.env.example`** (committed — placeholders only)

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Direct DB connection (migrations/seed). Password must be URL-encoded.
SUPABASE_DB_URL=postgresql://postgres:URLENCODED_PASSWORD@db.YOUR_PROJECT_REF.supabase.co:5432/postgres

# Seed admin (temporary; rotate after first login)
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=change-me
```

- [ ] **Step 2: Write `.env.local`** (NOT committed) — fill with the real values provided by the user:
  - `NEXT_PUBLIC_SUPABASE_URL=https://qysnyiufifgldieqnsly.supabase.co`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>`
  - `SUPABASE_SERVICE_ROLE_KEY=<service role key>`
  - `SUPABASE_DB_URL=postgresql://postgres:URLENCODED_PASSWORD@db.qysnyiufifgldieqnsly.supabase.co:5432/postgres`
  - `SEED_ADMIN_EMAIL=lucas.a2weber@gmail.com`
  - `SEED_ADMIN_PASSWORD=REDACTED`

- [ ] **Step 3: Verify `.env.local` is ignored** (from repo root)

```bash
git check-ignore sapatao-rh/.env.local
```

Expected: prints the path (meaning it IS ignored). If it prints nothing, STOP and fix `.gitignore`.

- [ ] **Step 4: Commit only the example**

```bash
git add sapatao-rh/.env.example
git commit -m "chore(sp0): add .env.example (secrets stay in .env.local)"
```

---

### Task A5: Initialize shadcn/ui + base components

**Files:** Create: `sapatao-rh/components.json`, `sapatao-rh/components/ui/*`, `sapatao-rh/lib/utils.ts`

- [ ] **Step 1: Init shadcn** (in `sapatao-rh/`)

```bash
npx shadcn@latest init
```

Choose defaults compatible with Tailwind 4 (base color: Slate; CSS variables: yes). This creates `components.json`, `lib/utils.ts`, and wires `globals.css`.

- [ ] **Step 2: Add the components SP0 needs**

```bash
npx shadcn@latest add button input label dialog dropdown-menu select table badge sonner avatar separator
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build completes without type errors.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/components.json sapatao-rh/components/ui sapatao-rh/lib/utils.ts sapatao-rh/app/globals.css sapatao-rh/package.json sapatao-rh/package-lock.json
git commit -m "feat(sp0): init shadcn/ui + base components"
```

---

### Task A6: Design tokens (Sapatão palette) + fonts

**Files:** Modify: `sapatao-rh/app/globals.css`, `sapatao-rh/app/layout.tsx`

- [ ] **Step 1: Add Sapatão tokens to `globals.css`** — append inside the existing `@theme` block (or add one). Tokens marked provisional per spec §7.

```css
@theme {
  /* Sapatão — PROVISÓRIO até validar manual da marca (PRD §11) */
  --color-sapatao-verde: #1e4d2b;
  --color-sapatao-verde-claro: #4a7c59;
  --color-sapatao-laranja: #e85d2f;
  --color-sapatao-amarelo: #ffd500;
  --color-neutro-900: #0f1419;
  --color-neutro-700: #3d4852;
  --color-neutro-200: #e8ecef;
  --color-neutro-50: #fafbfc;

  --font-display: var(--font-archivo);
  --font-sans: var(--font-inter);
  --font-mono: var(--font-jetbrains);
}
```

- [ ] **Step 2: Wire fonts in `app/layout.tsx`** (replace the default font setup)

```tsx
import type { Metadata } from "next";
import { Inter, Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], variable: "--font-archivo" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Sapatão RH",
  description: "Plataforma de Recrutamento e Gestão de Pessoas",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${archivo.variable} ${jetbrains.variable}`}>
      <body className="font-sans antialiased bg-neutro-50 text-neutro-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 3: Verify**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/app/globals.css sapatao-rh/app/layout.tsx
git commit -m "feat(sp0): sapatao design tokens + fonts"
```

---

# Phase B — Database & RLS

> The **superpowers:supabase** skill activates here. Migrations live in `sapatao-rh/supabase/migrations/`. Apply them to the remote project with the direct DB URL (no `supabase login` needed):
> `npx supabase db push --db-url "$env:SUPABASE_DB_URL"` (PowerShell) — or via the Supabase MCP `apply_migration` / SQL editor. The supabase skill will confirm the exact command.

### Task B1: Initialize Supabase project config

**Files:** Create: `sapatao-rh/supabase/config.toml`

- [ ] **Step 1: Init** (in `sapatao-rh/`)

```bash
npx supabase init
```

Creates `supabase/` with `config.toml`. Decline the VS Code settings prompt if asked.

- [ ] **Step 2: Commit**

```bash
git add sapatao-rh/supabase/config.toml sapatao-rh/supabase/.gitignore
git commit -m "chore(sp0): supabase init"
```

---

### Task B2: Migration — tables + updated_at trigger

**Files:** Create: `sapatao-rh/supabase/migrations/0001_tables.sql`

- [ ] **Step 1: Write `0001_tables.sql`**

```sql
-- updated_at trigger helper
create or replace function public.update_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

-- Empresas (tenants)
create table public.empresas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  slug       text not null unique,
  logo_url   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger empresas_updated before update on public.empresas
  for each row execute function public.update_updated_at();

-- Unidades
create table public.unidades (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nome       text not null,
  cidade     text,
  endereco   text,
  ativa      boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index unidades_empresa_idx on public.unidades(empresa_id);
create trigger unidades_updated before update on public.unidades
  for each row execute function public.update_updated_at();

-- Profiles (1:1 com auth.users)
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  empresa_id      uuid not null references public.empresas(id) on delete cascade,
  nome            text not null,
  email           text not null,
  role            text not null default 'viewer'
                  check (role in ('admin','rh','gestor_unidade','viewer')),
  platform_admin  boolean not null default false,
  unidades_acesso uuid[] not null default '{}',
  ativo           boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index profiles_empresa_idx on public.profiles(empresa_id);
create trigger profiles_updated before update on public.profiles
  for each row execute function public.update_updated_at();

-- Audit log
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid references public.empresas(id) on delete set null,
  ator_id     uuid references public.profiles(id) on delete set null,
  acao        text not null,
  entidade    text,
  entidade_id uuid,
  payload     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_empresa_idx on public.audit_log(empresa_id, created_at desc);
```

- [ ] **Step 2: Apply** (in `sapatao-rh/`, PowerShell — env loaded from `.env.local`)

```powershell
$env:SUPABASE_DB_URL = (Get-Content .env.local | Select-String '^SUPABASE_DB_URL=').ToString().Split('=',2)[1]
npx supabase db push --db-url $env:SUPABASE_DB_URL
```

Expected: migration `0001_tables` applied. (Alternative: paste SQL in Supabase SQL Editor / MCP `apply_migration`.)

- [ ] **Step 3: Verify tables exist** — in Supabase SQL editor or via MCP:

```sql
select table_name from information_schema.tables
where table_schema='public' order by table_name;
```

Expected: `audit_log, empresas, profiles, unidades`.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/supabase/migrations/0001_tables.sql
git commit -m "feat(sp0): db tables (empresas, unidades, profiles, audit_log)"
```

---

### Task B3: Migration — RLS helper functions

**Files:** Create: `sapatao-rh/supabase/migrations/0002_rls_helpers.sql`

- [ ] **Step 1: Write `0002_rls_helpers.sql`**

```sql
create or replace function public.current_empresa_id() returns uuid
  language sql stable as $$ select nullif(auth.jwt()->>'empresa_id','')::uuid $$;

create or replace function public.is_platform_admin() returns boolean
  language sql stable as $$ select coalesce((auth.jwt()->>'platform_admin')::boolean, false) $$;

create or replace function public.current_user_role() returns text
  language sql stable as $$ select coalesce(auth.jwt()->>'user_role','viewer') $$;
```

- [ ] **Step 2: Apply** (same `db push` command as B2 Step 2).

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/supabase/migrations/0002_rls_helpers.sql
git commit -m "feat(sp0): rls helper functions (empresa/role/platform from jwt)"
```

---

### Task B4: Migration — Custom Access Token Hook

**Files:** Create: `sapatao-rh/supabase/migrations/0003_access_token_hook.sql`; Modify: `sapatao-rh/supabase/config.toml`

- [ ] **Step 1: Write `0003_access_token_hook.sql`**

```sql
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb language plpgsql stable as $$
declare
  claims jsonb := event->'claims';
  v_empresa uuid; v_role text; v_platform boolean;
begin
  select empresa_id, role, platform_admin
    into v_empresa, v_role, v_platform
  from public.profiles where id = (event->>'user_id')::uuid;

  if v_empresa is not null then
    claims := jsonb_set(claims, '{empresa_id}',     to_jsonb(v_empresa::text));
    claims := jsonb_set(claims, '{user_role}',      to_jsonb(coalesce(v_role,'viewer')));
    claims := jsonb_set(claims, '{platform_admin}', to_jsonb(coalesce(v_platform,false)));
  end if;
  return jsonb_set(event, '{claims}', claims);
end; $$;

-- Auth admin runs the hook and must read profiles
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;
grant select on table public.profiles to supabase_auth_admin;

-- RLS policy so the auth admin can read profiles during token minting
create policy "auth_admin_reads_profiles" on public.profiles
  for select to supabase_auth_admin using (true);
```

> Note: `0004` enables RLS on `profiles`; this policy coexists with the tenant policies there. Keeping the policy in `0003` is fine because RLS is only enforced after `enable row level security` in `0004` — order of files (0003 before 0004) guarantees the function/grant exist first. If `supabase db push` complains that the policy references a table without RLS yet, move this single `create policy` line to the top of `0004`.

- [ ] **Step 2: Enable the hook in `config.toml`** — add:

```toml
[auth.hook.custom_access_token]
enabled = true
uri = "pg-functions://postgres/public/custom_access_token_hook"
```

- [ ] **Step 3: Apply the migration** (`db push` as before).

- [ ] **Step 4: Enable the hook on the REMOTE project.** Two options (supabase skill confirms current path):
  - **Dashboard:** Authentication → Hooks → *Custom Access Token* → enable → select function `public.custom_access_token_hook`.
  - **CLI (experimental):** `npx supabase config push`.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/supabase/migrations/0003_access_token_hook.sql sapatao-rh/supabase/config.toml
git commit -m "feat(sp0): custom access token hook (empresa/role claims in jwt)"
```

---

### Task B5: Migration — RLS policies

**Files:** Create: `sapatao-rh/supabase/migrations/0004_rls_policies.sql`

- [ ] **Step 1: Write `0004_rls_policies.sql`**

```sql
alter table public.empresas  enable row level security;
alter table public.unidades  enable row level security;
alter table public.profiles  enable row level security;
alter table public.audit_log enable row level security;

-- EMPRESAS: read own; platform admin reads all. Writes: platform admin only.
create policy empresas_select on public.empresas for select to authenticated
  using (id = public.current_empresa_id() or public.is_platform_admin());
create policy empresas_write on public.empresas for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

-- UNIDADES: read within tenant; write requires admin (or platform admin).
create policy unidades_select on public.unidades for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
create policy unidades_write on public.unidades for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin());

-- PROFILES: read within tenant; write requires admin (or platform admin).
-- (auth_admin_reads_profiles from 0003 also applies, for token minting.)
create policy profiles_select on public.profiles for select to authenticated
  using (empresa_id = public.current_empresa_id() or public.is_platform_admin());
create policy profiles_write on public.profiles for all to authenticated
  using ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin())
  with check ((empresa_id = public.current_empresa_id() and public.current_user_role() = 'admin')
         or public.is_platform_admin());

-- AUDIT_LOG: read within tenant (admin/platform); insert within tenant.
create policy audit_select on public.audit_log for select to authenticated
  using ((empresa_id = public.current_empresa_id()
          and public.current_user_role() = 'admin')
         or public.is_platform_admin());
create policy audit_insert on public.audit_log for insert to authenticated
  with check (empresa_id = public.current_empresa_id() or public.is_platform_admin());
```

> The `service_role` key bypasses RLS entirely (seed + admin route handlers), so these policies never block server-side admin operations — tenant safety there comes from the app-layer checks in Phase D/G.

- [ ] **Step 2: Apply** (`db push`).

- [ ] **Step 3: Verify RLS is on**

```sql
select relname, relrowsecurity from pg_class
where relname in ('empresas','unidades','profiles','audit_log');
```

Expected: `relrowsecurity = true` for all four.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/supabase/migrations/0004_rls_policies.sql
git commit -m "feat(sp0): rls policies (tenant isolation by empresa + role)"
```

---

# Phase C — Supabase clients & types

### Task C1: Supabase clients (browser / server / admin)

**Files:** Create: `sapatao-rh/lib/supabase/browser.ts`, `server.ts`, `admin.ts`

- [ ] **Step 1: `lib/supabase/browser.ts`**

```ts
import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 2: `lib/supabase/server.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/types/database";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // called from a Server Component — middleware refreshes the session
          }
        },
      },
    },
  );
}
```

- [ ] **Step 3: `lib/supabase/admin.ts`**

```ts
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/** Service-role client. SERVER ONLY — never import in a client component. */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
```

- [ ] **Step 4: Install `server-only`**

```bash
npm install server-only
```

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/supabase sapatao-rh/package.json sapatao-rh/package-lock.json
git commit -m "feat(sp0): supabase browser/server/admin clients"
```

---

### Task C2: Hand-written DB types

**Files:** Create: `sapatao-rh/types/database.ts`

- [ ] **Step 1: Write `types/database.ts`** (4 SP0 tables; expand in later slices)

```ts
export type Role = "admin" | "rh" | "gestor_unidade" | "viewer";

type Timestamps = { created_at: string; updated_at: string };

export interface Empresa extends Timestamps {
  id: string; nome: string; slug: string; logo_url: string | null; ativa: boolean;
}
export interface Unidade extends Timestamps {
  id: string; empresa_id: string; nome: string;
  cidade: string | null; endereco: string | null; ativa: boolean;
}
export interface Profile extends Timestamps {
  id: string; empresa_id: string; nome: string; email: string;
  role: Role; platform_admin: boolean; unidades_acesso: string[]; ativo: boolean;
}
export interface AuditLog {
  id: string; empresa_id: string | null; ator_id: string | null;
  acao: string; entidade: string | null; entidade_id: string | null;
  payload: Record<string, unknown>; created_at: string;
}

export interface Database {
  public: {
    Tables: {
      empresas: { Row: Empresa; Insert: Partial<Empresa> & { nome: string; slug: string }; Update: Partial<Empresa> };
      unidades: { Row: Unidade; Insert: Partial<Unidade> & { empresa_id: string; nome: string }; Update: Partial<Unidade> };
      profiles: { Row: Profile; Insert: Partial<Profile> & { id: string; empresa_id: string; nome: string; email: string }; Update: Partial<Profile> };
      audit_log: { Row: AuditLog; Insert: Partial<AuditLog> & { acao: string }; Update: Partial<AuditLog> };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/types/database.ts
git commit -m "feat(sp0): hand-written db types for sp0 tables"
```

---

# Phase D — Business logic (TDD core)

### Task D1: RBAC helpers (pure functions)

**Files:** Create: `sapatao-rh/lib/auth/rbac.test.ts`, then `sapatao-rh/lib/auth/rbac.ts`

- [ ] **Step 1: Write failing test — `lib/auth/rbac.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { navItemsForRole, canAccessPath, canSeeUnidade, NAV } from "./rbac";

describe("navItemsForRole", () => {
  it("admin sees every nav item incl. configuracoes", () => {
    const keys = navItemsForRole("admin").map((i) => i.key);
    expect(keys).toEqual(NAV.map((i) => i.key));
    expect(keys).toContain("configuracoes");
  });
  it("rh sees operational items but NOT configuracoes", () => {
    const keys = navItemsForRole("rh").map((i) => i.key);
    expect(keys).toContain("chat");
    expect(keys).toContain("funcionarios");
    expect(keys).not.toContain("configuracoes");
  });
  it("viewer sees only dashboard", () => {
    expect(navItemsForRole("viewer").map((i) => i.key)).toEqual(["dashboard"]);
  });
  it("gestor_unidade sees its scoped items, not configuracoes", () => {
    const keys = navItemsForRole("gestor_unidade").map((i) => i.key);
    expect(keys).toContain("funil");
    expect(keys).not.toContain("configuracoes");
  });
});

describe("canAccessPath", () => {
  it("blocks rh from /configuracoes/*", () => {
    expect(canAccessPath("rh", "/configuracoes/acessos")).toBe(false);
  });
  it("allows admin into /configuracoes/*", () => {
    expect(canAccessPath("admin", "/configuracoes/acessos")).toBe(true);
  });
  it("allows rh into /chat", () => {
    expect(canAccessPath("rh", "/chat")).toBe(true);
  });
  it("blocks viewer from /chat", () => {
    expect(canAccessPath("viewer", "/chat")).toBe(false);
  });
});

describe("canSeeUnidade", () => {
  const base = { role: "rh" as const, platform_admin: false, unidades_acesso: ["u1", "u2"] };
  it("true when unidade is in the access list", () => {
    expect(canSeeUnidade(base, "u1")).toBe(true);
  });
  it("false when unidade not in the access list", () => {
    expect(canSeeUnidade(base, "u9")).toBe(false);
  });
  it("platform_admin sees any unidade", () => {
    expect(canSeeUnidade({ ...base, platform_admin: true }, "u9")).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- rbac
```

Expected: FAIL — cannot find `./rbac`.

- [ ] **Step 3: Implement `lib/auth/rbac.ts`**

```ts
import type { Role } from "@/types/database";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  roles: Role[];
}

export const NAV: NavItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", roles: ["admin", "rh", "gestor_unidade", "viewer"] },
  { key: "chat", label: "Atendimento", href: "/chat", roles: ["admin", "rh"] },
  { key: "funil", label: "Funil", href: "/funil", roles: ["admin", "rh", "gestor_unidade"] },
  { key: "candidatos", label: "Candidatos", href: "/candidatos", roles: ["admin", "rh", "gestor_unidade"] },
  { key: "funcionarios", label: "Funcionários", href: "/funcionarios", roles: ["admin", "rh"] },
  { key: "indicadores", label: "Indicadores", href: "/indicadores", roles: ["admin", "rh", "gestor_unidade", "viewer"] },
  { key: "configuracoes", label: "Configurações", href: "/configuracoes/acessos", roles: ["admin"] },
];

export function navItemsForRole(role: Role): NavItem[] {
  return NAV.filter((item) => item.roles.includes(role));
}

export function canAccessPath(role: Role, path: string): boolean {
  const item = NAV.find((i) => path === i.href || path.startsWith(i.href + "/") || matchesSection(i, path));
  if (!item) return true; // unknown paths (e.g. /dashboard root) handled by their own item; default allow
  return item.roles.includes(role);
}

function matchesSection(item: NavItem, path: string): boolean {
  // configuracoes item guards the whole /configuracoes/* section
  if (item.key === "configuracoes") return path.startsWith("/configuracoes");
  const seg = "/" + item.key;
  return path === seg || path.startsWith(seg + "/");
}

export function canSeeUnidade(
  profile: { platform_admin: boolean; unidades_acesso: string[] },
  unidadeId: string,
): boolean {
  if (profile.platform_admin) return true;
  return profile.unidades_acesso.includes(unidadeId);
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- rbac
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/auth/rbac.ts sapatao-rh/lib/auth/rbac.test.ts
git commit -m "feat(sp0): rbac helpers (nav + route + unidade access) [tdd]"
```

---

### Task D2: Zod validation schemas

**Files:** Create: `sapatao-rh/lib/validations/usuarios.test.ts`, then `sapatao-rh/lib/validations/usuarios.ts`

- [ ] **Step 1: Write failing test — `lib/validations/usuarios.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { loginSchema, createUsuarioSchema } from "./usuarios";

describe("loginSchema", () => {
  it("accepts a valid email + password", () => {
    expect(loginSchema.safeParse({ email: "a@b.com", password: "secret1" }).success).toBe(true);
  });
  it("rejects a bad email", () => {
    expect(loginSchema.safeParse({ email: "nope", password: "secret1" }).success).toBe(false);
  });
});

describe("createUsuarioSchema", () => {
  const ok = {
    nome: "Maria RH",
    email: "maria@sapatao.com",
    senha: "trocar123",
    role: "rh",
    unidades_acesso: ["11111111-1111-1111-1111-111111111111"],
  };
  it("accepts a valid payload", () => {
    expect(createUsuarioSchema.safeParse(ok).success).toBe(true);
  });
  it("rejects password shorter than 6", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, senha: "123" }).success).toBe(false);
  });
  it("rejects an invalid role", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, role: "root" }).success).toBe(false);
  });
  it("rejects a non-uuid unidade", () => {
    expect(createUsuarioSchema.safeParse({ ...ok, unidades_acesso: ["not-a-uuid"] }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- validations/usuarios
```

Expected: FAIL — cannot find `./usuarios`.

- [ ] **Step 3: Implement `lib/validations/usuarios.ts`**

```ts
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha muito curta"),
});

export const roleSchema = z.enum(["admin", "rh", "gestor_unidade", "viewer"]);

export const createUsuarioSchema = z.object({
  nome: z.string().min(2, "Informe o nome"),
  email: z.string().email("E-mail inválido"),
  senha: z.string().min(6, "Mínimo de 6 caracteres"),
  role: roleSchema,
  unidades_acesso: z.array(z.string().uuid()).default([]),
});

export const editUsuarioSchema = z.object({
  id: z.string().uuid(),
  role: roleSchema,
  unidades_acesso: z.array(z.string().uuid()).default([]),
  ativo: z.boolean(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateUsuarioInput = z.infer<typeof createUsuarioSchema>;
export type EditUsuarioInput = z.infer<typeof editUsuarioSchema>;
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- validations/usuarios
```

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/validations/usuarios.ts sapatao-rh/lib/validations/usuarios.test.ts
git commit -m "feat(sp0): zod schemas for login + user crud [tdd]"
```

---

### Task D3: User-creation service (admin API, dependency-injected for testability)

**Files:** Create: `sapatao-rh/lib/usuarios/create-usuario.test.ts`, then `sapatao-rh/lib/usuarios/create-usuario.ts`

- [ ] **Step 1: Write failing test — `lib/usuarios/create-usuario.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import { createUsuario, type AdminLike } from "./create-usuario";

const actor = {
  empresa_id: "emp-1",
  ator_id: "admin-1",
  role: "admin" as const,
  platform_admin: false,
};

const input = {
  nome: "Maria RH",
  email: "maria@sapatao.com",
  senha: "trocar123",
  role: "rh" as const,
  unidades_acesso: ["11111111-1111-1111-1111-111111111111"],
};

function makeAdmin(overrides: Partial<AdminLike> = {}): AdminLike {
  return {
    auth: {
      admin: {
        createUser: vi.fn(async () => ({ data: { user: { id: "new-user-1" } }, error: null })),
      },
    },
    from: vi.fn(() => ({
      insert: vi.fn(async () => ({ error: null })),
    })),
    ...overrides,
  } as unknown as AdminLike;
}

describe("createUsuario", () => {
  it("rejects when actor is not admin", async () => {
    const admin = makeAdmin();
    const res = await createUsuario(input, { ...actor, role: "rh" }, admin);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("forbidden");
    expect(admin.auth.admin.createUser).not.toHaveBeenCalled();
  });

  it("creates the auth user with email_confirm and inserts the profile in the actor's empresa", async () => {
    const insert = vi.fn(async () => ({ error: null }));
    const admin = makeAdmin({ from: vi.fn(() => ({ insert })) as AdminLike["from"] });
    const res = await createUsuario(input, actor, admin);

    expect(res.ok).toBe(true);
    expect(admin.auth.admin.createUser).toHaveBeenCalledWith({
      email: input.email,
      password: input.senha,
      email_confirm: true,
    });
    expect(admin.from).toHaveBeenCalledWith("profiles");
    const profileRow = insert.mock.calls[0][0];
    expect(profileRow).toMatchObject({
      id: "new-user-1",
      empresa_id: "emp-1",
      nome: "Maria RH",
      email: "maria@sapatao.com",
      role: "rh",
      unidades_acesso: input.unidades_acesso,
      platform_admin: false,
    });
  });

  it("returns email_exists when the admin API reports a duplicate", async () => {
    const admin = makeAdmin();
    (admin.auth.admin.createUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: null },
      error: { message: "User already registered" },
    });
    const res = await createUsuario(input, actor, admin);
    expect(res.ok).toBe(false);
    expect(res.error).toBe("email_exists");
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npm test -- create-usuario
```

Expected: FAIL — cannot find `./create-usuario`.

- [ ] **Step 3: Implement `lib/usuarios/create-usuario.ts`**

```ts
import type { CreateUsuarioInput } from "@/lib/validations/usuarios";
import type { Role } from "@/types/database";

export interface AdminLike {
  auth: {
    admin: {
      createUser: (args: {
        email: string;
        password: string;
        email_confirm: boolean;
      }) => Promise<{ data: { user: { id: string } | null }; error: { message: string } | null }>;
    };
  };
  from: (table: string) => {
    insert: (row: unknown) => Promise<{ error: { message: string } | null }>;
  };
}

export interface ActorContext {
  empresa_id: string;
  ator_id: string;
  role: Role;
  platform_admin: boolean;
}

export type CreateUsuarioResult =
  | { ok: true; userId: string }
  | { ok: false; error: "forbidden" | "email_exists" | "auth_failed" | "profile_failed" };

export async function createUsuario(
  input: CreateUsuarioInput,
  actor: ActorContext,
  admin: AdminLike,
): Promise<CreateUsuarioResult> {
  if (actor.role !== "admin" && !actor.platform_admin) {
    return { ok: false, error: "forbidden" };
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.senha,
    email_confirm: true,
  });

  if (error || !data.user) {
    const dup = error?.message?.toLowerCase().includes("already");
    return { ok: false, error: dup ? "email_exists" : "auth_failed" };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: data.user.id,
    empresa_id: actor.empresa_id,
    nome: input.nome,
    email: input.email,
    role: input.role,
    platform_admin: false,
    unidades_acesso: input.unidades_acesso,
    ativo: true,
  });

  if (profileError) return { ok: false, error: "profile_failed" };

  await admin.from("audit_log").insert({
    empresa_id: actor.empresa_id,
    ator_id: actor.ator_id,
    acao: "usuario.criado",
    entidade: "profiles",
    entidade_id: data.user.id,
    payload: { role: input.role, email: input.email },
  });

  return { ok: true, userId: data.user.id };
}
```

- [ ] **Step 4: Run — expect PASS**

```bash
npm test -- create-usuario
```

- [ ] **Step 5: Commit**

```bash
git add sapatao-rh/lib/usuarios
git commit -m "feat(sp0): user-creation service (admin api, injectable) [tdd]"
```

---

# Phase E — Auth

### Task E1: Middleware (session refresh + route protection)

**Files:** Create: `sapatao-rh/lib/supabase/middleware.ts`, `sapatao-rh/middleware.ts`

- [ ] **Step 1: `lib/supabase/middleware.ts`**

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith("/login");

  if (!user && !isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }
  return response;
}
```

- [ ] **Step 2: `middleware.ts`** (project root inside `sapatao-rh/`)

```ts
import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build OK (middleware compiles).

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/lib/supabase/middleware.ts sapatao-rh/middleware.ts
git commit -m "feat(sp0): auth middleware (session refresh + route guard)"
```

---

### Task E2: getCurrentProfile helper

**Files:** Create: `sapatao-rh/lib/auth/current-profile.ts`

- [ ] **Step 1: Write `lib/auth/current-profile.ts`**

```ts
import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/types/database";

/** Returns the logged-in user's profile, or null if not authenticated / no profile. */
export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile) ?? null;
}
```

- [ ] **Step 2: Typecheck**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/lib/auth/current-profile.ts
git commit -m "feat(sp0): getCurrentProfile server helper"
```

---

### Task E3: Login page + sign-in/out actions

**Files:** Create: `sapatao-rh/app/(auth)/login/actions.ts`, `sapatao-rh/app/(auth)/login/page.tsx`

- [ ] **Step 1: `app/(auth)/login/actions.ts`**

```ts
"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/usuarios";

export async function signIn(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: "Informe e-mail e senha válidos." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { error: "E-mail ou senha incorretos." };
  }

  // block deactivated users
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("ativo")
      .eq("id", user.id)
      .single();
    if (profile && !profile.ativo) {
      await supabase.auth.signOut();
      return { error: "Acesso desativado. Fale com o administrador." };
    }
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
```

- [ ] **Step 2: `app/(auth)/login/page.tsx`**

```tsx
"use client";

import { useActionState } from "react";
import { signIn } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, null);

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutro-50 p-4">
      <form
        action={formAction}
        className="w-full max-w-sm space-y-4 rounded-xl border border-neutro-200 bg-white p-8 shadow-sm"
      >
        <div className="space-y-1 text-center">
          <h1 className="font-display text-2xl font-bold text-sapatao-verde">Sapatão RH</h1>
          <p className="text-sm text-neutro-700">Acesse sua conta</p>
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
          <p role="alert" className="text-sm text-sapatao-laranja">
            {state.error}
          </p>
        )}

        <Button type="submit" disabled={pending} className="w-full">
          {pending ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build OK. (Full login flow is verified in Phase H after the seed.)

- [ ] **Step 4: Commit**

```bash
git add "sapatao-rh/app/(auth)"
git commit -m "feat(sp0): login page + sign-in/out actions"
```

---

# Phase F — App shell

### Task F1: Unidade store (Zustand)

**Files:** Create: `sapatao-rh/stores/unidade-store.ts`

- [ ] **Step 1: Write `stores/unidade-store.ts`**

```ts
import { create } from "zustand";

interface UnidadeState {
  unidadeId: string | null; // null = "todas as unidades"
  setUnidade: (id: string | null) => void;
}

export const useUnidadeStore = create<UnidadeState>((set) => ({
  unidadeId: null,
  setUnidade: (id) => set({ unidadeId: id }),
}));
```

- [ ] **Step 2: Commit**

```bash
git add sapatao-rh/stores/unidade-store.ts
git commit -m "feat(sp0): unidade selection store"
```

---

### Task F2: Sidebar + Topbar components

**Files:** Create: `sapatao-rh/components/shell/sidebar.tsx`, `sapatao-rh/components/shell/topbar.tsx`

- [ ] **Step 1: `components/shell/sidebar.tsx`**

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItemsForRole } from "@/lib/auth/rbac";
import type { Role } from "@/types/database";
import { cn } from "@/lib/utils";

export function Sidebar({ role }: { role: Role }) {
  const pathname = usePathname();
  const items = navItemsForRole(role);

  return (
    <aside className="flex w-60 flex-col border-r border-neutro-200 bg-sapatao-verde text-white">
      <div className="px-5 py-6 font-display text-lg font-bold">Sapatão RH</div>
      <nav className="flex-1 space-y-1 px-2">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "block rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/15" : "hover:bg-white/10",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 2: `components/shell/topbar.tsx`**

```tsx
"use client";

import { useEffect } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { useUnidadeStore } from "@/stores/unidade-store";
import type { Profile, Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

export function Topbar({ profile, unidades }: { profile: Profile; unidades: Unidade[] }) {
  const { unidadeId, setUnidade } = useUnidadeStore();

  useEffect(() => {
    if (!unidadeId && unidades.length === 1) setUnidade(unidades[0].id);
  }, [unidadeId, unidades, setUnidade]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-neutro-200 bg-white px-4">
      <Select value={unidadeId ?? "todas"} onValueChange={(v) => setUnidade(v === "todas" ? null : v)}>
        <SelectTrigger className="w-56">
          <SelectValue placeholder="Unidade" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="todas">Todas as unidades</SelectItem>
          {unidades.map((u) => (
            <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-3">
        <div className="text-right">
          <div className="text-sm font-medium text-neutro-900">{profile.nome}</div>
          <div className="text-xs text-neutro-700 capitalize">{profile.role}</div>
        </div>
        <form action={signOut}>
          <Button type="submit" variant="ghost" size="sm">Sair</Button>
        </form>
      </div>
    </header>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/components/shell
git commit -m "feat(sp0): sidebar + topbar (role-filtered nav, unidade selector)"
```

---

### Task F3: App layout + placeholder pages

**Files:** Create: `sapatao-rh/components/shared/coming-soon.tsx`, `sapatao-rh/app/(app)/layout.tsx`, and placeholder pages.

- [ ] **Step 1: `components/shared/coming-soon.tsx`**

```tsx
export function ComingSoon({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
      <h1 className="font-display text-2xl font-bold text-neutro-900">{title}</h1>
      <p className="text-sm text-neutro-700">Em construção — chega numa próxima fatia.</p>
    </div>
  );
}
```

- [ ] **Step 2: `app/(app)/layout.tsx`** (guards auth, loads profile + unidades)

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import type { Unidade } from "@/types/database";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.ativo) redirect("/login");

  const supabase = await createClient();
  const { data: unidades } = await supabase
    .from("unidades")
    .select("*")
    .order("nome");

  const visiveis = (unidades ?? []).filter(
    (u: Unidade) => profile.platform_admin || profile.unidades_acesso.includes(u.id),
  );

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar role={profile.role} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Topbar profile={profile} unidades={visiveis} />
        <main className="flex-1 overflow-auto bg-neutro-50 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the six placeholder pages.** Each file contains exactly the content below, substituting the title:

`app/(app)/dashboard/page.tsx`:
```tsx
import { ComingSoon } from "@/components/shared/coming-soon";
export default function Page() { return <ComingSoon title="Dashboard" />; }
```

Repeat the identical file (only the `title` string changes) for:

| File | title |
|------|-------|
| `app/(app)/chat/page.tsx` | `Atendimento` |
| `app/(app)/funil/page.tsx` | `Funil` |
| `app/(app)/candidatos/page.tsx` | `Candidatos` |
| `app/(app)/funcionarios/page.tsx` | `Funcionários` |
| `app/(app)/indicadores/page.tsx` | `Indicadores` |

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build OK; all routes compile.

- [ ] **Step 5: Commit**

```bash
git add "sapatao-rh/app/(app)" sapatao-rh/components/shared
git commit -m "feat(sp0): app shell layout + placeholder pages"
```

---

# Phase G — Configurações > Acessos

### Task G1: Create-user route handler (service role)

**Files:** Create: `sapatao-rh/app/api/usuarios/route.ts`

- [ ] **Step 1: `app/api/usuarios/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createAdminClient } from "@/lib/supabase/admin";
import { createUsuarioSchema } from "@/lib/validations/usuarios";
import { createUsuario } from "@/lib/usuarios/create-usuario";

export async function POST(request: Request) {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const parsed = createUsuarioSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid", issues: parsed.error.flatten() }, { status: 422 });
  }

  const admin = createAdminClient();
  const result = await createUsuario(
    parsed.data,
    {
      empresa_id: profile.empresa_id,
      ator_id: profile.id,
      role: profile.role,
      platform_admin: profile.platform_admin,
    },
    admin,
  );

  if (!result.ok) {
    const status = result.error === "forbidden" ? 403 : result.error === "email_exists" ? 409 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }
  return NextResponse.json({ ok: true, userId: result.userId }, { status: 201 });
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 3: Commit**

```bash
git add sapatao-rh/app/api/usuarios
git commit -m "feat(sp0): POST /api/usuarios (admin-only, service role)"
```

---

### Task G2: Acessos page (list) + new-user form

**Files:** Create: `sapatao-rh/app/(app)/configuracoes/acessos/page.tsx`, `sapatao-rh/app/(app)/configuracoes/acessos/novo-usuario-form.tsx`

- [ ] **Step 1: List page — `app/(app)/configuracoes/acessos/page.tsx`**

```tsx
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/current-profile";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Unidade } from "@/types/database";
import { NovoUsuarioForm } from "./novo-usuario-form";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

export default async function AcessosPage() {
  const profile = await getCurrentProfile();
  if (!profile || (profile.role !== "admin" && !profile.platform_admin)) {
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const [{ data: usuarios }, { data: unidades }] = await Promise.all([
    supabase.from("profiles").select("*").order("nome"),
    supabase.from("unidades").select("*").order("nome"),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Acessos</h1>
          <p className="text-sm text-neutro-700">Usuários e níveis de acesso da empresa.</p>
        </div>
        <NovoUsuarioForm unidades={(unidades ?? []) as Unidade[]} />
      </div>

      <div className="rounded-lg border border-neutro-200 bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Papel</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {((usuarios ?? []) as Profile[]).map((u) => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell>{u.email}</TableCell>
                <TableCell className="capitalize">{u.role}</TableCell>
                <TableCell>
                  <Badge variant={u.ativo ? "default" : "secondary"}>
                    {u.ativo ? "Ativo" : "Inativo"}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

> Note: shadcn exports are `TableBody`, `TableHead`, etc. Use those exact casings (the snippet above intentionally imports them; fix any casing the linter flags).

- [ ] **Step 2: New-user form — `app/(app)/configuracoes/acessos/novo-usuario-form.tsx`**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { Unidade } from "@/types/database";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ROLES = ["admin", "rh", "gestor_unidade", "viewer"] as const;
const ERRORS: Record<string, string> = {
  email_exists: "Já existe um usuário com esse e-mail.",
  invalid: "Verifique os campos do formulário.",
  forbidden: "Você não tem permissão.",
};

export function NovoUsuarioForm({ unidades }: { unidades: Unidade[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<string>("rh");
  const [unidadeId, setUnidadeId] = useState<string>(unidades[0]?.id ?? "");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: fd.get("nome"),
        email: fd.get("email"),
        senha: fd.get("senha"),
        role,
        unidades_acesso: unidadeId ? [unidadeId] : [],
      }),
    });
    setSaving(false);

    if (res.ok) {
      toast.success("Usuário criado.");
      setOpen(false);
      router.refresh();
    } else {
      const body = await res.json().catch(() => ({}));
      toast.error(ERRORS[body.error] ?? "Não foi possível criar o usuário.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Novo usuário</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input id="nome" name="nome" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">E-mail</Label>
            <Input id="email" name="email" type="email" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="senha">Senha</Label>
            <Input id="senha" name="senha" type="text" minLength={6} required />
          </div>
          <div className="space-y-2">
            <Label>Papel</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r} className="capitalize">{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unidade</Label>
            <Select value={unidadeId} onValueChange={setUnidadeId}>
              <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
              <SelectContent>
                {unidades.map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Criando..." : "Criar usuário"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Add `<Toaster />`** to `app/(app)/layout.tsx` — import and render `import { Toaster } from "@/components/ui/sonner";` then add `<Toaster />` just before the closing `</div>` of the outer flex container.

- [ ] **Step 4: Verify build**

```bash
npm run build
```

Expected: build OK.

- [ ] **Step 5: Commit**

```bash
git add "sapatao-rh/app/(app)/configuracoes" "sapatao-rh/app/(app)/layout.tsx"
git commit -m "feat(sp0): configuracoes > acessos (list + create user)"
```

---

# Phase H — Seed & verification

### Task H1: Seed script

**Files:** Create: `sapatao-rh/supabase/seed.mjs`; Modify: `sapatao-rh/package.json` (add `"seed"` script)

- [ ] **Step 1: Write `supabase/seed.mjs`** (idempotent; reads `.env.local`)

```js
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// load .env.local
for (const line of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] ??= m[2].trim();
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

async function main() {
  // 1) empresa (idempotent by slug)
  let { data: empresa } = await admin.from("empresas").select("*").eq("slug", "estacao-sapatao").maybeSingle();
  if (!empresa) {
    ({ data: empresa } = await admin
      .from("empresas")
      .insert({ nome: "Estação Sapatão", slug: "estacao-sapatao", ativa: true })
      .select()
      .single());
    console.log("empresa criada:", empresa.id);
  } else {
    console.log("empresa já existe:", empresa.id);
  }

  // 2) unidade Novo Hamburgo (idempotent by nome+empresa)
  let { data: unidade } = await admin
    .from("unidades")
    .select("*")
    .eq("empresa_id", empresa.id)
    .eq("nome", "Novo Hamburgo")
    .maybeSingle();
  if (!unidade) {
    ({ data: unidade } = await admin
      .from("unidades")
      .insert({ empresa_id: empresa.id, nome: "Novo Hamburgo", cidade: "Novo Hamburgo", ativa: true })
      .select()
      .single());
    console.log("unidade criada:", unidade.id);
  } else {
    console.log("unidade já existe:", unidade.id);
  }

  // 3) admin user (idempotent — skip if email already exists)
  const email = process.env.SEED_ADMIN_EMAIL;
  const { data: list } = await admin.auth.admin.listUsers();
  let user = list.users.find((u) => u.email === email);
  if (!user) {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: process.env.SEED_ADMIN_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
    user = data.user;
    console.log("admin auth user criado:", user.id);
  } else {
    console.log("admin auth user já existe:", user.id);
  }

  // 4) profile (upsert)
  const { error: pErr } = await admin.from("profiles").upsert({
    id: user.id,
    empresa_id: empresa.id,
    nome: "Lucas (Admin)",
    email,
    role: "admin",
    platform_admin: true,
    unidades_acesso: [unidade.id],
    ativo: true,
  });
  if (pErr) throw pErr;
  console.log("profile admin pronto. Seed concluído.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Add script to `package.json`**

```json
"seed": "node supabase/seed.mjs"
```

- [ ] **Step 3: Run the seed** (in `sapatao-rh/`)

```bash
npm run seed
```

Expected: logs "empresa criada", "unidade criada", "admin auth user criado", "Seed concluído." Running twice = "já existe" messages (idempotent).

- [ ] **Step 4: Commit**

```bash
git add sapatao-rh/supabase/seed.mjs sapatao-rh/package.json
git commit -m "feat(sp0): bootstrap seed (estacao sapatao + novo hamburgo + admin)"
```

---

### Task H2: End-to-end verification (acceptance criteria)

**Files:** none (manual verification)

- [ ] **Step 1: Start the app**

```bash
npm run dev
```

- [ ] **Step 2: Verify login** — open http://localhost:3000 → redirected to `/login`. Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`. Expected: lands on `/dashboard` with the shell (sidebar shows all items incl. Configurações).

- [ ] **Step 3: Verify JWT claims (hook works)** — in Configurações > Acessos the list loads under RLS (proves `empresa_id` claim is present; an empty/blocked list means the hook isn't enabled — revisit Task B4 Step 4).

- [ ] **Step 4: Create an RH user** — Configurações > Acessos → "Novo usuário" → nome, e-mail, senha (≥6), papel `rh`, unidade Novo Hamburgo → Criar. Expected: toast success, row appears.

- [ ] **Step 5: Verify role isolation** — sign out, sign in as the new RH user. Expected: sidebar has NO "Configurações"; visiting `/configuracoes/acessos` redirects to `/dashboard`.

- [ ] **Step 6: Verify tenant isolation** — confirm queries only return Estação Sapatão data (only one empresa exists now; deeper multi-empresa test deferred). Record result.

- [ ] **Step 7: Document the run** — note pass/fail for each acceptance criterion (spec §12) in the PR/commit message.

---

### Task H3: Final quality gate

**Files:** none

- [ ] **Step 1: Run full test suite with coverage**

```bash
npm run test:cov
```

Expected: all tests pass; business-logic files (`rbac`, `validations/usuarios`, `usuarios/create-usuario`) at/above the spec's ≥60% target. If below, add cases to existing test files.

- [ ] **Step 2: Lint + typecheck + build**

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: clean.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore(sp0): foundation complete — login, acessos, shell, rls verified"
```

---

## Self-Review (author checklist — completed)

**Spec coverage (§ → task):**
- §2 stack → A1–A2, A5; multi-tenant → B2–B5; admin-creates-credentials → D3, G1–G2.
- §3 data model → B2 (tables), C2 (types).
- §4 auth/session → C1, E1–E3.
- §5 RLS + hook → B3, B4, B5.
- §6 Acessos → D2, D3, G1, G2.
- §7 design system + shell → A6, F1–F3.
- §8 seed → H1.
- §10 tests → D1–D3 (TDD), H3 (coverage gate).
- §11 scope boundary → F3 placeholders; no chat/funil/IA logic.
- §12 acceptance → H2.

**Placeholder scan:** no "TBD"/"add error handling"-style gaps; every code step has full code. The six placeholder pages are fully specified (shared component + per-file title table).

**Type consistency:** `Role`, `Profile`, `Unidade` from `types/database.ts` used consistently; `createUsuario(input, actor, admin)` signature matches between D3 and G1; `AdminLike`/`ActorContext` shared; `navItemsForRole`/`canAccessPath`/`canSeeUnidade` names consistent across D1, F1, layout guards.

**Known execution-time confirmations (supabase skill drives):** exact `create-next-app`/`shadcn`/`supabase` CLI prompts; remote auth-hook enablement (Dashboard vs `config push`); shadcn Table export casings.

---

**Fim — Plano SP0 v1.0**
