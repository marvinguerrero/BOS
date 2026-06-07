---
name: bos-tech-stack
description: BOS tech stack, key architectural decisions, folder structure, file conventions
metadata:
  type: project
---

**Stack:** Next.js 16.2.7 (App Router), TypeScript 5, Tailwind CSS, shadcn/ui v2 (uses @base-ui/react, NOT @radix-ui)

**Backend:** Supabase (PostgreSQL + Auth + RLS + Storage). `createClient()` returns untyped `any` — see [[bos-known-issues]].

**State:** Zustand stores in `src/stores/` — auth, business (active business + template config), cart (POS), notifications.

**Data fetching:** TanStack Query. All queries use `queryKey: [entity, businessId]` pattern for cache isolation.

**Key file locations:**
- Types: `src/types/index.ts`
- Supabase client (browser): `src/lib/supabase/client.ts`
- Supabase client (server): `src/lib/supabase/server.ts`
- Template engine: `src/lib/template-engine/index.ts`
- DB migration: `supabase/migrations/00001_initial_schema.sql`
- Template seeds: `supabase/seed/01_templates.sql`
- Auth proxy: `src/proxy.ts` (Next.js 16 uses "proxy" not "middleware")

**Route structure:** `src/app/(dashboard)/[businessId]/[module]/page.tsx`

**Folder conventions:**
- `src/components/modules/[module]/` — module-specific components
- `src/components/widgets/` — dashboard widget components
- `src/components/layout/` — AppShell, Sidebar, Header
- `src/components/shared/` — cross-cutting components (GlobalSearch, Providers, NotificationsView)

**How to apply:** When adding new modules or templates, follow the existing pattern: add template config to seed SQL, add modules to `getDefaultModulesForTemplate()` in template-engine, create pages under `[businessId]/`, register navigation items in the template config.
