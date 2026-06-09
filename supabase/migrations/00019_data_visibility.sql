-- ============================================================================
-- DATA VISIBILITY ENFORCEMENT
-- ============================================================================
--
-- Replaces the broad "any business member can read everything" RLS policies
-- on orders and sales with scope-aware policies driven by the permission
-- profile system.
--
-- Scope semantics:
--   all        → sees all records in the business
--   department → same as 'all' until departments are implemented
--   assigned   → orders: assigned_to_person_id = own person id
--                sales:  cashier_id = auth.uid()
--   own        → orders: created_by = auth.uid()
--                sales:  cashier_id = auth.uid()
--   NULL       → no permission at all → no rows returned
--
-- Enforcement is at the DB (RLS) layer. Server components do NOT need to add
-- scope filters manually — queries will automatically return only authorized rows.
--
-- Tables covered: orders, sales, sale_items
-- Tables NOT changed: laundry_orders (legacy), financial_accounts (separate spec)

-- ── 1. Optimized scope helper for RLS ─────────────────────────────────────
--
-- Inlines the full permission resolution in a single STABLE SECURITY DEFINER
-- function. PostgreSQL caches STABLE results per-query per unique arg set, so
-- when all rows share the same business_id (the common case), this runs once.

CREATE OR REPLACE FUNCTION public.effective_scope(
  p_business_id uuid,
  p_key         text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_uid        uuid    := auth.uid();
  v_role       text;
  v_member_id  uuid;
  v_profile_id uuid;
  v_override   boolean;
  v_scope      text;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;

  SELECT id, role::text, permission_profile_id
  INTO   v_member_id, v_role, v_profile_id
  FROM   business_users
  WHERE  business_id = p_business_id
    AND  user_id     = v_uid
    AND  is_active   = true
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Owners always have full access.
  IF v_role = 'owner' THEN RETURN 'all'; END IF;

  -- Check for an explicit individual override (grant or deny).
  SELECT granted
  INTO   v_override
  FROM   business_user_permissions
  WHERE  business_user_id = v_member_id
    AND  permission_key   = p_key
  LIMIT 1;

  -- Explicit individual DENY → no access regardless of profile/role.
  IF v_override = false THEN RETURN NULL; END IF;

  -- Profile-based scope (when a profile is assigned to this user).
  IF v_profile_id IS NOT NULL THEN
    SELECT ppg.scope INTO v_scope
    FROM   permission_profile_grants ppg
    WHERE  ppg.profile_id     = v_profile_id
      AND  ppg.permission_key = p_key;

    IF FOUND THEN
      RETURN v_scope;  -- profile grants this permission with its scope
    END IF;

    -- Profile doesn't include this key.
    -- An individual GRANT compensates (but scope is 'all' since no profile scope).
    IF v_override = true THEN RETURN 'all'; END IF;
    RETURN NULL;
  END IF;

  -- No profile: fall back to role_permissions.
  IF EXISTS (
    SELECT 1 FROM role_permissions
    WHERE  role = v_role AND permission_key = p_key
  ) THEN
    RETURN 'all';  -- role grants it; role defaults carry no scope metadata
  END IF;

  -- Role doesn't have this permission.
  IF v_override = true THEN RETURN 'all'; END IF;  -- individual grant wins
  RETURN NULL;
END;
$$;

-- ── 2. Indexes to support the new RLS predicates ───────────────────────────

-- For orders: assigned scope filter on assigned_to_person_id already indexed.
-- Add index for the 'own' scope filter on created_by.
CREATE INDEX IF NOT EXISTS idx_orders_business_created_by
  ON public.orders (business_id, created_by);

-- For sales: scope filter on cashier_id.
CREATE INDEX IF NOT EXISTS idx_sales_business_cashier
  ON public.sales (business_id, cashier_id);

-- ── 3. Orders: replace member_read with scope-aware policy ─────────────────

DROP POLICY IF EXISTS "orders_member_read" ON public.orders;

CREATE POLICY "orders_scope_read" ON public.orders
  FOR SELECT
  USING (
    CASE public.effective_scope(business_id, 'orders.view')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN assigned_to_person_id = public.get_user_person_id(business_id)
      WHEN 'own'        THEN created_by = auth.uid()
      ELSE false
    END
  );

-- ── 4. Sales: replace member_read with scope-aware policy ─────────────────

DROP POLICY IF EXISTS "sales_member_read" ON public.sales;

CREATE POLICY "sales_scope_read" ON public.sales
  FOR SELECT
  USING (
    CASE public.effective_scope(business_id, 'sales.view')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN cashier_id = auth.uid()
      WHEN 'own'        THEN cashier_id = auth.uid()
      ELSE false
    END
  );

-- ── 5. Sale items: inherit access from parent sale ─────────────────────────
--
-- The subquery below runs through the sales_scope_read RLS policy, so a user
-- who cannot see a sale cannot see its items. No duplicate scope logic needed.

DROP POLICY IF EXISTS "sale_items_member_read" ON public.sale_items;

CREATE POLICY "sale_items_scope_read" ON public.sale_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.sales WHERE id = sale_id
    )
  );
