-- ============================================================================
-- OPERATOR WRITE ENFORCEMENT
-- ============================================================================
--
-- Fixes two gaps left by previous migrations:
--
-- 1. CRITICAL — orders_member_write (FOR ALL) bypasses orders_scope_read
--    PostgreSQL ORs permissive policies: because orders_member_write has
--    FOR ALL USING (is_member()), any business member could SELECT all orders
--    regardless of orders_scope_read. Drop it and replace with granular
--    INSERT / UPDATE / DELETE policies that respect scope.
--
-- 2. Write-side scope enforcement for operators
--    Service Operators must only UPDATE orders assigned to them.
--    Sales Operators must only UPDATE their own sales.
--    Only users with the .delete permission can delete records.
--
-- Tables: orders, sales, sale_items

-- ── 1. Drop the over-permissive FOR ALL policy on orders ───────────────────
--
-- This is the root cause of the SELECT bypass. All three operations
-- (INSERT / UPDATE / DELETE) are replaced below with granular policies.

DROP POLICY IF EXISTS "orders_member_write" ON public.orders;

-- ── 2. Orders INSERT ────────────────────────────────────────────────────────
--
-- Any user who has been granted orders.create (at any scope) can open a new
-- order. The assignment enforcement trigger in migration 00018 then sets
-- assigned_to_person_id to the current user when they lack orders.assign.

CREATE POLICY "orders_scope_insert" ON public.orders
  FOR INSERT
  WITH CHECK (
    public.effective_scope(business_id, 'orders.create') IS NOT NULL
  );

-- ── 3. Orders UPDATE ────────────────────────────────────────────────────────
--
-- 'all' / 'department' → can update any order in the business
-- 'assigned'           → can only update orders assigned to themselves
-- 'own'                → can only update orders they created
-- NULL                 → cannot update anything
--
-- The assignment enforcement trigger still fires on any update that touches
-- assigned_to_person_id, so operators can never reassign via UPDATE either.

CREATE POLICY "orders_scope_update" ON public.orders
  FOR UPDATE
  USING (
    CASE public.effective_scope(business_id, 'orders.update')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN
        assigned_to_person_id = public.get_user_person_id(business_id)
      WHEN 'own'        THEN
        created_by = auth.uid()
      ELSE false
    END
  );

-- ── 4. Orders DELETE ────────────────────────────────────────────────────────
--
-- Only users explicitly granted orders.delete (Operations Manager, Business
-- Manager, Owner) can delete. Operators (Service Operator profile) do not
-- have this permission.

CREATE POLICY "orders_scope_delete" ON public.orders
  FOR DELETE
  USING (
    public.effective_scope(business_id, 'orders.delete') IS NOT NULL
  );

-- ── 5. Sales INSERT ─────────────────────────────────────────────────────────
--
-- Replace the membership-only check with a permission check.
-- Sales Operators (and above) have sales.create; Service Operators do not.

DROP POLICY IF EXISTS "sales_member_insert" ON public.sales;

CREATE POLICY "sales_scope_insert" ON public.sales
  FOR INSERT
  WITH CHECK (
    public.effective_scope(business_id, 'sales.create') IS NOT NULL
  );

-- ── 6. Sales UPDATE ─────────────────────────────────────────────────────────
--
-- For voiding / editing a sale. Sales Operators can update their own sales
-- (cashier_id = them). Managers / owners can update any sale.

CREATE POLICY "sales_scope_update" ON public.sales
  FOR UPDATE
  USING (
    CASE public.effective_scope(business_id, 'sales.update')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN cashier_id = auth.uid()
      WHEN 'own'        THEN cashier_id = auth.uid()
      ELSE false
    END
  );

-- ── 7. Sales DELETE ─────────────────────────────────────────────────────────

CREATE POLICY "sales_scope_delete" ON public.sales
  FOR DELETE
  USING (
    public.effective_scope(business_id, 'sales.delete') IS NOT NULL
  );

-- ── 8. Sale items INSERT ────────────────────────────────────────────────────
--
-- Replace the membership-only check with a permission check via parent sale.
-- The subquery resolves the business_id through the parent sale, then checks
-- the sales.create permission. This is consistent with sales_scope_insert.

DROP POLICY IF EXISTS "sale_items_member_insert" ON public.sale_items;

CREATE POLICY "sale_items_scope_insert" ON public.sale_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales s
      WHERE  s.id = sale_id
        AND  public.effective_scope(s.business_id, 'sales.create') IS NOT NULL
    )
  );

-- ── 9. Profile grant fixups ─────────────────────────────────────────────────
--
-- Sales Operators need sales.update (own scope) to void or edit their own
-- transactions. This was absent from the initial profile seeding in 00017.
-- Operations Manager is given sales.delete for operational control.

DO $$
DECLARE
  v_sales_op_id uuid;
  v_ops_mgr_id  uuid;
BEGIN
  SELECT id INTO v_sales_op_id
  FROM   public.permission_profiles
  WHERE  name = 'Sales Operator' AND business_id IS NULL;

  SELECT id INTO v_ops_mgr_id
  FROM   public.permission_profiles
  WHERE  name = 'Operations Manager' AND business_id IS NULL;

  IF v_sales_op_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_sales_op_id, 'sales.update', 'own')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'own';
  END IF;

  IF v_ops_mgr_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_ops_mgr_id, 'sales.delete', 'all')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'all';
  END IF;
END;
$$;
