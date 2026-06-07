---
name: bos-known-issues
description: Known TypeScript/runtime issues and their workarounds in BOS
metadata:
  type: feedback
---

**1. shadcn/ui v2 uses @base-ui/react (not @radix-ui)**

**Why:** shadcn CLI installed Base UI components (button, select, dropdown-menu, dialog, etc.) instead of Radix-based ones.

**How to apply:**
- `Select.onValueChange` receives `(value: string | null, eventDetails)` — always handle null: `onValueChange={(v) => handler(v ?? 'default')}`
- `DropdownMenuTrigger/DropdownMenuItem` don't have `asChild` prop — use `onClick` with `router.push()` instead of wrapping Link
- Button renders as `@base-ui/react/button` — no `asChild`. Wrap in a div or use `onClick` navigation.
- Dialog API is compatible (`open`/`onOpenChange`)
- `Menu.GroupLabel` (`DropdownMenuLabel`) **requires a `Menu.Group` ancestor** — it calls `useMenuGroupRootContext()` and throws `MenuGroupContext is missing` if used outside a Group. Our `DropdownMenuLabel` is implemented as a plain `<div>` to avoid this; it is a visual header, not an aria group label.

---

**2. Supabase TypeScript generic inference is broken**

**Why:** `@supabase/supabase-js` v2.107 with TypeScript 5 strict mode fails to infer table types from `createBrowserClient<Database>`. This causes `insert()`/`update()` to expect `never`.

**Fix:** `src/lib/supabase/client.ts` and `server.ts` return untyped `any` client. All query results need manual type assertions:
```typescript
const { data } = await supabase.from('businesses').select('*').eq('id', id).single()
const business = data as Business | null
```

**How to apply:** Always cast Supabase query results to the appropriate type from `src/types/index.ts`. Never rely on automatic type inference from the Supabase client.

---

**3. Next.js 16 uses "proxy" not "middleware"**

**Why:** Next.js 16 renamed `middleware.ts` to `proxy.ts`. Auth session refresh is in `src/proxy.ts` with exported function `proxy()`.

**How to apply:** Route protection logic lives in `src/proxy.ts`. It checks auth and redirects unauthenticated users to `/auth/login`.

---

**4. zodResolver with z.coerce.number() needs explicit Resolver cast**

**Why:** TypeScript can't match `z.coerce.number()` (unknown input) to react-hook-form's `Resolver<FormValues>`.

**Fix:** `resolver: zodResolver(schema) as Resolver<FormValues>` — applied in product-dialog, service-dialog, room-dialog, tenant-dialog, new-order-view.

---

**5. RLS chicken-and-egg: business_users / business_modules INSERT blocked on first create**

**Why:** `business_users_admin_write FOR ALL USING (is_business_admin(business_id))` checks `business_users` for admin membership. Before the first row exists, the check returns false → 403. Same for `business_modules_admin_write`.

**Fix:** Migration `00002_fix_bootstrap_rls.sql` adds additive INSERT policies `business_users_creator_bootstrap` and `business_modules_creator_bootstrap` that gate on `businesses.created_by = auth.uid()` instead. PostgreSQL ORs permissive policies of the same command, so the bootstrap policies cover the initial insert while the admin policies cover subsequent management.

**How to apply:** Any new multi-tenant table where admins manage rows must consider the bootstrap case. Add a creator INSERT policy if the first row can't be inserted by an existing admin check.

---

**6. PostgREST visibility check: INSERT + .select() fails when RLS SELECT policy references not-yet-created related rows**

**Why:** `POST /table?select=*` runs the SELECT policy on the returned row. If the SELECT policy references another table (e.g. `is_business_member` checks `business_users`), and that table doesn't have the row yet, the check fails → 403 even though INSERT itself would succeed.

**Fix:** Generate UUID client-side with `crypto.randomUUID()`, pass it as `id` in the INSERT, and drop `.select()`. The UUID is known without a round-trip.

**How to apply:** Any INSERT that chains `.select()` and whose SELECT policy has a dependency on rows inserted in a later step must use this pattern.
