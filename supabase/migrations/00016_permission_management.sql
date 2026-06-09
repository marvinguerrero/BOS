-- ============================================================================
-- PERMISSION MANAGEMENT
-- ============================================================================
--
-- Adds:
--   1. Missing permissions for modules added after migration 00004
--      (dashboard, generic orders/services, financial_accounts, people)
--   2. Role grants for all new + previously-missing entries
--   3. is_business_owner() helper
--   4. Owner-only write policy on business_user_permissions
--      (replaces the admin-write policy from 00004)
--   5. granted_by + created_at on business_user_permissions
--   6. get_my_permissions(p_business_id) RPC for client-side bulk fetch

-- ── 1. New permission keys ─────────────────────────────────────────────────

INSERT INTO public.permissions (key, module_key, action) VALUES
  -- dashboard
  ('dashboard.view',              'dashboard',         'view'),
  -- generic orders
  ('orders.view',                 'orders',            'view'),
  ('orders.create',               'orders',            'create'),
  ('orders.update',               'orders',            'update'),
  ('orders.delete',               'orders',            'delete'),
  -- generic services
  ('services.view',               'services',          'view'),
  ('services.create',             'services',          'create'),
  ('services.update',             'services',          'update'),
  ('services.delete',             'services',          'delete'),
  -- financial accounts
  ('financial_accounts.view',     'financial_accounts','view'),
  ('financial_accounts.create',   'financial_accounts','create'),
  ('financial_accounts.update',   'financial_accounts','update'),
  ('financial_accounts.delete',   'financial_accounts','delete'),
  -- people / team management
  ('people.view',                 'people',            'view'),
  ('people.create',               'people',            'create'),
  ('people.update',               'people',            'update'),
  ('people.delete',               'people',            'delete')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Role permissions ────────────────────────────────────────────────────
--
-- Owner — backfill any permission added since 00004

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'owner', key FROM public.permissions
ON CONFLICT DO NOTHING;

-- Manager — operational access + financial view + people management
-- (no financial edits, no invitations.create, no settings.update)
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('manager', 'dashboard.view'),
  ('manager', 'orders.view'),
  ('manager', 'orders.create'),
  ('manager', 'orders.update'),
  ('manager', 'services.view'),
  ('manager', 'services.create'),
  ('manager', 'services.update'),
  ('manager', 'financial_accounts.view'),
  ('manager', 'people.view'),
  ('manager', 'people.update'),
  ('manager', 'invitations.view'),
  ('manager', 'settings.view'),
  -- fill: inventory management (was excluded via SELECT-except in 00004 - only delete was excluded)
  ('manager', 'inventory.view'),
  ('manager', 'inventory.create'),
  ('manager', 'inventory.update'),
  -- customers edit
  ('manager', 'customers.update'),
  ('manager', 'customers.delete')
ON CONFLICT DO NOTHING;

-- Staff — day-to-day operations only
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('staff', 'dashboard.view'),
  -- sales: can view and create, not edit/void
  ('staff', 'sales.view'),
  ('staff', 'sales.create'),
  -- orders: full operational
  ('staff', 'orders.view'),
  ('staff', 'orders.create'),
  ('staff', 'orders.update'),
  -- customers: can view, add, and update (no delete)
  ('staff', 'customers.view'),
  ('staff', 'customers.create'),
  ('staff', 'customers.update'),
  -- inventory: read-only (to know stock levels)
  ('staff', 'inventory.view'),
  -- notifications always accessible
  ('staff', 'notifications.view')
ON CONFLICT DO NOTHING;

-- Viewer — read-only across operational modules
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('viewer', 'dashboard.view'),
  ('viewer', 'sales.view'),
  ('viewer', 'orders.view'),
  ('viewer', 'services.view'),
  ('viewer', 'customers.view'),
  ('viewer', 'inventory.view'),
  ('viewer', 'notifications.view'),
  -- laundry / rooms / billing: read
  ('viewer', 'laundry_orders.view'),
  ('viewer', 'laundry_services.view'),
  ('viewer', 'rooms.view'),
  ('viewer', 'tenants.view'),
  ('viewer', 'billing.view')
ON CONFLICT DO NOTHING;

-- Also ensure manager has all the laundry / rooms / billing from 00004
-- (the original INSERT excluded only deletes; fill gaps)
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('manager', 'laundry_orders.view'),
  ('manager', 'laundry_orders.create'),
  ('manager', 'laundry_orders.update'),
  ('manager', 'laundry_orders.delete'),
  ('manager', 'laundry_services.view'),
  ('manager', 'laundry_services.create'),
  ('manager', 'laundry_services.update'),
  ('manager', 'rooms.view'),
  ('manager', 'rooms.create'),
  ('manager', 'rooms.update'),
  ('manager', 'tenants.view'),
  ('manager', 'tenants.create'),
  ('manager', 'tenants.update'),
  ('manager', 'billing.view'),
  ('manager', 'billing.create'),
  ('manager', 'billing.update'),
  ('manager', 'reports.view'),
  ('manager', 'notifications.view')
ON CONFLICT DO NOTHING;

-- Staff: laundry / rooms pass-through (if module is enabled)
INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('staff', 'laundry_orders.view'),
  ('staff', 'laundry_orders.create'),
  ('staff', 'laundry_orders.update'),
  ('staff', 'laundry_services.view'),
  ('staff', 'rooms.view'),
  ('staff', 'tenants.view')
ON CONFLICT DO NOTHING;

-- ── 3. is_business_owner() helper ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_business_owner(p_business_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.business_users
    WHERE business_id = p_business_id
      AND user_id     = auth.uid()
      AND role        = 'owner'
      AND is_active   = true
  );
$$;

-- ── 4. Tighten business_user_permissions write policy to owner-only ────────

ALTER TABLE public.business_user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "business_user_permissions_admin_write" ON public.business_user_permissions;

CREATE POLICY "business_user_permissions_owner_write"
  ON public.business_user_permissions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.business_users bu
      WHERE bu.id          = business_user_id
        AND public.is_business_owner(bu.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.business_users bu
      WHERE bu.id          = business_user_id
        AND public.is_business_owner(bu.business_id)
    )
  );

-- ── 5. Add audit columns to business_user_permissions ─────────────────────

ALTER TABLE public.business_user_permissions
  ADD COLUMN IF NOT EXISTS granted_by  uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS set_updated_at ON public.business_user_permissions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.business_user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 6. get_my_permissions(p_business_id) ──────────────────────────────────
--
-- Returns the full list of permission keys that are effectively active for
-- the calling user in the given business. Considers:
--   owner  → all permissions
--   others → role defaults merged with per-user overrides
--
-- Used by the client to populate the Zustand store on business load.

CREATE OR REPLACE FUNCTION public.get_my_permissions(p_business_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id   uuid := auth.uid();
  v_role      text;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT id, role::text
  INTO   v_member_id, v_role
  FROM   public.business_users
  WHERE  business_id = p_business_id
    AND  user_id     = v_user_id
    AND  is_active   = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  -- Owner → every permission
  IF v_role = 'owner' THEN
    RETURN ARRAY(SELECT key FROM public.permissions ORDER BY key);
  END IF;

  -- Everyone else → role defaults + explicit grants - explicit denials
  RETURN ARRAY(
    SELECT DISTINCT p.key
    FROM   public.permissions p
    WHERE  (
      -- Explicitly granted override
      EXISTS (
        SELECT 1
        FROM   public.business_user_permissions bup
        WHERE  bup.business_user_id = v_member_id
          AND  bup.permission_key   = p.key
          AND  bup.granted          = true
      )
    ) OR (
      -- Role default, and not explicitly denied
      EXISTS (
        SELECT 1
        FROM   public.role_permissions rp
        WHERE  rp.role            = v_role
          AND  rp.permission_key  = p.key
      )
      AND NOT EXISTS (
        SELECT 1
        FROM   public.business_user_permissions bup
        WHERE  bup.business_user_id = v_member_id
          AND  bup.permission_key   = p.key
          AND  bup.granted          = false
      )
    )
    ORDER BY p.key
  );
END;
$$;
