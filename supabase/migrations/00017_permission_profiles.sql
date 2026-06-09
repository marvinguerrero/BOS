-- ============================================================================
-- PERMISSION PROFILES
-- ============================================================================
--
-- Adds a named-profile layer between role defaults and individual overrides.
-- Profiles are industry-agnostic bundles of permissions with scope metadata.
-- They are separate from positions (which describe job titles).
--
-- Resolution order (most-specific wins):
--   1. Owner role            → always full access, no checks
--   2. Individual overrides  → explicit grant or explicit deny
--   3. Profile grants        → if business_users.permission_profile_id is set
--   4. Role defaults         → fallback when no profile is assigned
--
-- Scopes: own | assigned | department | all
--   own        = records created by the current user
--   assigned   = records assigned to the current user
--   department = records belonging to the same operational group
--   all        = no restriction within the business

-- ── 1. Permission profiles ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_profiles (
  id           uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id  uuid        REFERENCES public.businesses(id) ON DELETE CASCADE,
  -- NULL = global system profile available to every business
  name         text        NOT NULL,
  description  text,
  is_system    boolean     NOT NULL DEFAULT false,
  sort_order   integer     NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Unique profile name per scope (global or per-business)
CREATE UNIQUE INDEX IF NOT EXISTS permission_profiles_unique_name_global
  ON public.permission_profiles (name)
  WHERE business_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS permission_profiles_unique_name_business
  ON public.permission_profiles (business_id, name)
  WHERE business_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.permission_profiles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.permission_profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── 2. Permission profile grants ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.permission_profile_grants (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  profile_id     uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  permission_key text NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
  scope          text NOT NULL DEFAULT 'all',
  UNIQUE (profile_id, permission_key),
  CHECK (scope IN ('own', 'assigned', 'department', 'all'))
);

-- ── 3. Profile column on business_users ───────────────────────────────────

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS permission_profile_id
    uuid REFERENCES public.permission_profiles(id) ON DELETE SET NULL;

-- ── 4. Profile column on business_invitations ─────────────────────────────

ALTER TABLE public.business_invitations
  ADD COLUMN IF NOT EXISTS permission_profile_id
    uuid REFERENCES public.permission_profiles(id) ON DELETE SET NULL;

-- ── 5. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.permission_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_profile_grants ENABLE ROW LEVEL SECURITY;

-- Any authenticated user can read system profiles
-- Business members can read profiles belonging to their business
CREATE POLICY "permission_profiles_read"
  ON public.permission_profiles FOR SELECT
  USING (
    business_id IS NULL                            -- system profiles: visible to all
    OR public.is_business_member(business_id)      -- business profiles: members only
  );

-- Only owners can create/edit/delete business-custom profiles
CREATE POLICY "permission_profiles_owner_write"
  ON public.permission_profiles FOR ALL
  USING    (business_id IS NOT NULL AND public.is_business_owner(business_id))
  WITH CHECK (business_id IS NOT NULL AND public.is_business_owner(business_id));

-- Profile grants follow the profile's visibility
CREATE POLICY "permission_profile_grants_read"
  ON public.permission_profile_grants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.permission_profiles pp
      WHERE pp.id = profile_id
        AND (
          pp.business_id IS NULL
          OR public.is_business_member(pp.business_id)
        )
    )
  );

CREATE POLICY "permission_profile_grants_owner_write"
  ON public.permission_profile_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.permission_profiles pp
      WHERE pp.id = profile_id
        AND pp.business_id IS NOT NULL
        AND public.is_business_owner(pp.business_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.permission_profiles pp
      WHERE pp.id = profile_id
        AND pp.business_id IS NOT NULL
        AND public.is_business_owner(pp.business_id)
    )
  );

-- ── 6. Seed system profiles ────────────────────────────────────────────────

DO $$
DECLARE
  v_viewer_id        uuid;
  v_sales_op_id      uuid;
  v_service_op_id    uuid;
  v_inventory_op_id  uuid;
  v_rental_op_id     uuid;
  v_financial_op_id  uuid;
  v_ops_mgr_id       uuid;
  v_biz_mgr_id       uuid;
  v_owner_id         uuid;
BEGIN

  -- ── Insert profiles ──────────────────────────────────────────────────────

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Viewer', 'Read-only access across all modules', true, 10)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_viewer_id;
  IF v_viewer_id IS NULL THEN
    SELECT id INTO v_viewer_id FROM public.permission_profiles WHERE name = 'Viewer' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Sales Operator', 'Creates and processes sales transactions', true, 20)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_sales_op_id;
  IF v_sales_op_id IS NULL THEN
    SELECT id INTO v_sales_op_id FROM public.permission_profiles WHERE name = 'Sales Operator' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Service Operator', 'Handles service orders and work assignments', true, 30)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_service_op_id;
  IF v_service_op_id IS NULL THEN
    SELECT id INTO v_service_op_id FROM public.permission_profiles WHERE name = 'Service Operator' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Inventory Operator', 'Manages products and stock levels', true, 40)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_inventory_op_id;
  IF v_inventory_op_id IS NULL THEN
    SELECT id INTO v_inventory_op_id FROM public.permission_profiles WHERE name = 'Inventory Operator' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Rental Operator', 'Manages rooms, tenants, and billing', true, 50)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_rental_op_id;
  IF v_rental_op_id IS NULL THEN
    SELECT id INTO v_rental_op_id FROM public.permission_profiles WHERE name = 'Rental Operator' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Financial Operator', 'Manages financial accounts and reports', true, 60)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_financial_op_id;
  IF v_financial_op_id IS NULL THEN
    SELECT id INTO v_financial_op_id FROM public.permission_profiles WHERE name = 'Financial Operator' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Operations Manager', 'Oversees day-to-day operations across all modules', true, 70)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_ops_mgr_id;
  IF v_ops_mgr_id IS NULL THEN
    SELECT id INTO v_ops_mgr_id FROM public.permission_profiles WHERE name = 'Operations Manager' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Business Manager', 'Full operational authority including finances and settings', true, 80)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_biz_mgr_id;
  IF v_biz_mgr_id IS NULL THEN
    SELECT id INTO v_biz_mgr_id FROM public.permission_profiles WHERE name = 'Business Manager' AND business_id IS NULL;
  END IF;

  INSERT INTO public.permission_profiles (name, description, is_system, sort_order)
  VALUES ('Owner', 'Full unrestricted access — reserved for owners', true, 90)
  ON CONFLICT (name) WHERE business_id IS NULL
  DO UPDATE SET description = EXCLUDED.description, sort_order = EXCLUDED.sort_order
  RETURNING id INTO v_owner_id;
  IF v_owner_id IS NULL THEN
    SELECT id INTO v_owner_id FROM public.permission_profiles WHERE name = 'Owner' AND business_id IS NULL;
  END IF;

  -- ── Viewer grants ─────────────────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_viewer_id, 'dashboard.view',        'all'),
    (v_viewer_id, 'sales.view',            'all'),
    (v_viewer_id, 'orders.view',           'all'),
    (v_viewer_id, 'services.view',         'all'),
    (v_viewer_id, 'customers.view',        'all'),
    (v_viewer_id, 'inventory.view',        'all'),
    (v_viewer_id, 'laundry_orders.view',   'all'),
    (v_viewer_id, 'laundry_services.view', 'all'),
    (v_viewer_id, 'rooms.view',            'all'),
    (v_viewer_id, 'tenants.view',          'all'),
    (v_viewer_id, 'billing.view',          'all'),
    (v_viewer_id, 'notifications.view',    'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Sales Operator grants ─────────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_sales_op_id, 'dashboard.view',     'all'),
    (v_sales_op_id, 'sales.view',         'own'),
    (v_sales_op_id, 'sales.create',       'own'),
    (v_sales_op_id, 'customers.view',     'all'),
    (v_sales_op_id, 'customers.create',   'all'),
    (v_sales_op_id, 'customers.update',   'all'),
    (v_sales_op_id, 'inventory.view',     'all'),
    (v_sales_op_id, 'notifications.view', 'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Service Operator grants ───────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_service_op_id, 'dashboard.view',          'all'),
    (v_service_op_id, 'orders.view',             'assigned'),
    (v_service_op_id, 'orders.create',           'own'),
    (v_service_op_id, 'orders.update',           'assigned'),
    (v_service_op_id, 'services.view',           'all'),
    (v_service_op_id, 'laundry_orders.view',     'assigned'),
    (v_service_op_id, 'laundry_orders.create',   'own'),
    (v_service_op_id, 'laundry_orders.update',   'assigned'),
    (v_service_op_id, 'laundry_services.view',   'all'),
    (v_service_op_id, 'customers.view',          'all'),
    (v_service_op_id, 'customers.create',        'all'),
    (v_service_op_id, 'notifications.view',      'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Inventory Operator grants ─────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_inventory_op_id, 'dashboard.view',     'all'),
    (v_inventory_op_id, 'inventory.view',     'all'),
    (v_inventory_op_id, 'inventory.create',   'all'),
    (v_inventory_op_id, 'inventory.update',   'all'),
    (v_inventory_op_id, 'notifications.view', 'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Rental Operator grants ────────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_rental_op_id, 'dashboard.view',     'all'),
    (v_rental_op_id, 'rooms.view',         'all'),
    (v_rental_op_id, 'rooms.create',       'all'),
    (v_rental_op_id, 'rooms.update',       'all'),
    (v_rental_op_id, 'tenants.view',       'all'),
    (v_rental_op_id, 'tenants.create',     'all'),
    (v_rental_op_id, 'tenants.update',     'all'),
    (v_rental_op_id, 'billing.view',       'all'),
    (v_rental_op_id, 'billing.create',     'all'),
    (v_rental_op_id, 'billing.update',     'all'),
    (v_rental_op_id, 'customers.view',     'all'),
    (v_rental_op_id, 'notifications.view', 'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Financial Operator grants ─────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_financial_op_id, 'dashboard.view',               'all'),
    (v_financial_op_id, 'financial_accounts.view',      'all'),
    (v_financial_op_id, 'financial_accounts.create',    'all'),
    (v_financial_op_id, 'financial_accounts.update',    'all'),
    (v_financial_op_id, 'reports.view',                 'all'),
    (v_financial_op_id, 'sales.view',                   'all'),
    (v_financial_op_id, 'customers.view',               'all'),
    (v_financial_op_id, 'notifications.view',           'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Operations Manager grants ─────────────────────────────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_ops_mgr_id, 'dashboard.view',          'all'),
    (v_ops_mgr_id, 'sales.view',              'all'),
    (v_ops_mgr_id, 'sales.create',            'all'),
    (v_ops_mgr_id, 'sales.update',            'all'),
    (v_ops_mgr_id, 'orders.view',             'all'),
    (v_ops_mgr_id, 'orders.create',           'all'),
    (v_ops_mgr_id, 'orders.update',           'all'),
    (v_ops_mgr_id, 'orders.delete',           'all'),
    (v_ops_mgr_id, 'services.view',           'all'),
    (v_ops_mgr_id, 'services.create',         'all'),
    (v_ops_mgr_id, 'services.update',         'all'),
    (v_ops_mgr_id, 'laundry_orders.view',     'all'),
    (v_ops_mgr_id, 'laundry_orders.create',   'all'),
    (v_ops_mgr_id, 'laundry_orders.update',   'all'),
    (v_ops_mgr_id, 'laundry_orders.delete',   'all'),
    (v_ops_mgr_id, 'laundry_services.view',   'all'),
    (v_ops_mgr_id, 'laundry_services.create', 'all'),
    (v_ops_mgr_id, 'laundry_services.update', 'all'),
    (v_ops_mgr_id, 'customers.view',          'all'),
    (v_ops_mgr_id, 'customers.create',        'all'),
    (v_ops_mgr_id, 'customers.update',        'all'),
    (v_ops_mgr_id, 'inventory.view',          'all'),
    (v_ops_mgr_id, 'inventory.create',        'all'),
    (v_ops_mgr_id, 'inventory.update',        'all'),
    (v_ops_mgr_id, 'reports.view',            'all'),
    (v_ops_mgr_id, 'people.view',             'all'),
    (v_ops_mgr_id, 'people.update',           'all'),
    (v_ops_mgr_id, 'settings.view',           'all'),
    (v_ops_mgr_id, 'notifications.view',      'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Business Manager grants ───────────────────────────────────────────────
  -- All of Operations Manager, plus financials, full people mgmt, full settings
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope) VALUES
    (v_biz_mgr_id, 'dashboard.view',               'all'),
    (v_biz_mgr_id, 'sales.view',                   'all'),
    (v_biz_mgr_id, 'sales.create',                 'all'),
    (v_biz_mgr_id, 'sales.update',                 'all'),
    (v_biz_mgr_id, 'sales.delete',                 'all'),
    (v_biz_mgr_id, 'orders.view',                  'all'),
    (v_biz_mgr_id, 'orders.create',                'all'),
    (v_biz_mgr_id, 'orders.update',                'all'),
    (v_biz_mgr_id, 'orders.delete',                'all'),
    (v_biz_mgr_id, 'services.view',                'all'),
    (v_biz_mgr_id, 'services.create',              'all'),
    (v_biz_mgr_id, 'services.update',              'all'),
    (v_biz_mgr_id, 'services.delete',              'all'),
    (v_biz_mgr_id, 'laundry_orders.view',          'all'),
    (v_biz_mgr_id, 'laundry_orders.create',        'all'),
    (v_biz_mgr_id, 'laundry_orders.update',        'all'),
    (v_biz_mgr_id, 'laundry_orders.delete',        'all'),
    (v_biz_mgr_id, 'laundry_services.view',        'all'),
    (v_biz_mgr_id, 'laundry_services.create',      'all'),
    (v_biz_mgr_id, 'laundry_services.update',      'all'),
    (v_biz_mgr_id, 'customers.view',               'all'),
    (v_biz_mgr_id, 'customers.create',             'all'),
    (v_biz_mgr_id, 'customers.update',             'all'),
    (v_biz_mgr_id, 'customers.delete',             'all'),
    (v_biz_mgr_id, 'inventory.view',               'all'),
    (v_biz_mgr_id, 'inventory.create',             'all'),
    (v_biz_mgr_id, 'inventory.update',             'all'),
    (v_biz_mgr_id, 'inventory.delete',             'all'),
    (v_biz_mgr_id, 'financial_accounts.view',      'all'),
    (v_biz_mgr_id, 'financial_accounts.create',    'all'),
    (v_biz_mgr_id, 'financial_accounts.update',    'all'),
    (v_biz_mgr_id, 'financial_accounts.delete',    'all'),
    (v_biz_mgr_id, 'reports.view',                 'all'),
    (v_biz_mgr_id, 'people.view',                  'all'),
    (v_biz_mgr_id, 'people.create',                'all'),
    (v_biz_mgr_id, 'people.update',                'all'),
    (v_biz_mgr_id, 'people.delete',                'all'),
    (v_biz_mgr_id, 'invitations.view',             'all'),
    (v_biz_mgr_id, 'invitations.create',           'all'),
    (v_biz_mgr_id, 'invitations.update',           'all'),
    (v_biz_mgr_id, 'rooms.view',                   'all'),
    (v_biz_mgr_id, 'rooms.create',                 'all'),
    (v_biz_mgr_id, 'rooms.update',                 'all'),
    (v_biz_mgr_id, 'rooms.delete',                 'all'),
    (v_biz_mgr_id, 'tenants.view',                 'all'),
    (v_biz_mgr_id, 'tenants.create',               'all'),
    (v_biz_mgr_id, 'tenants.update',               'all'),
    (v_biz_mgr_id, 'billing.view',                 'all'),
    (v_biz_mgr_id, 'billing.create',               'all'),
    (v_biz_mgr_id, 'billing.update',               'all'),
    (v_biz_mgr_id, 'settings.view',                'all'),
    (v_biz_mgr_id, 'settings.update',              'all'),
    (v_biz_mgr_id, 'notifications.view',           'all')
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = EXCLUDED.scope;

  -- ── Owner profile grants (all permissions, scope all) ─────────────────────
  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
  SELECT v_owner_id, key, 'all' FROM public.permissions
  ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'all';

END;
$$;

-- ── 7. Update get_my_permissions() to use profiles ─────────────────────────
--
-- When the user has a permission_profile_id set, their profile's grants
-- replace the role_permissions as the permission base.
-- Individual overrides (business_user_permissions) always take precedence.

CREATE OR REPLACE FUNCTION public.get_my_permissions(p_business_id uuid)
RETURNS text[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_role       text;
  v_member_id  uuid;
  v_profile_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT id, role::text, permission_profile_id
  INTO   v_member_id, v_role, v_profile_id
  FROM   public.business_users
  WHERE  business_id = p_business_id
    AND  user_id     = v_user_id
    AND  is_active   = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  IF v_role = 'owner' THEN
    RETURN ARRAY(SELECT key FROM public.permissions ORDER BY key);
  END IF;

  RETURN ARRAY(
    SELECT DISTINCT p.key
    FROM   public.permissions p
    WHERE  (
      -- Explicitly granted individual override (always wins)
      EXISTS (
        SELECT 1 FROM public.business_user_permissions bup
        WHERE  bup.business_user_id = v_member_id
          AND  bup.permission_key   = p.key
          AND  bup.granted          = true
      )
    ) OR (
      -- Not explicitly denied
      NOT EXISTS (
        SELECT 1 FROM public.business_user_permissions bup
        WHERE  bup.business_user_id = v_member_id
          AND  bup.permission_key   = p.key
          AND  bup.granted          = false
      )
      AND (
        -- Profile grants (if profile is assigned)
        (
          v_profile_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.permission_profile_grants ppg
            WHERE  ppg.profile_id     = v_profile_id
              AND  ppg.permission_key = p.key
          )
        )
        OR
        -- Role defaults (fallback when no profile)
        (
          v_profile_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.role_permissions rp
            WHERE  rp.role            = v_role
              AND  rp.permission_key  = p.key
          )
        )
      )
    )
    ORDER BY p.key
  );
END;
$$;

-- ── 8. get_my_permission_scopes() ──────────────────────────────────────────
--
-- Returns a JSONB map of { permission_key: scope } for all permissions the
-- calling user effectively has. Used by the client to apply scope-aware
-- filtering (e.g. only show assigned orders vs. all orders).

CREATE OR REPLACE FUNCTION public.get_my_permission_scopes(p_business_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_role       text;
  v_member_id  uuid;
  v_profile_id uuid;
  v_result     jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT id, role::text, permission_profile_id
  INTO   v_member_id, v_role, v_profile_id
  FROM   public.business_users
  WHERE  business_id = p_business_id
    AND  user_id     = v_user_id
    AND  is_active   = true
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN '{}'::jsonb;
  END IF;

  -- Owner: all permissions at 'all' scope
  IF v_role = 'owner' THEN
    SELECT jsonb_object_agg(key, 'all') INTO v_result FROM public.permissions;
    RETURN COALESCE(v_result, '{}'::jsonb);
  END IF;

  -- Everyone else: compute effective permissions with their scope
  SELECT jsonb_object_agg(
    p.key,
    CASE
      -- Profile scope (when profile is assigned)
      WHEN v_profile_id IS NOT NULL THEN
        COALESCE(
          (SELECT ppg.scope
           FROM   public.permission_profile_grants ppg
           WHERE  ppg.profile_id     = v_profile_id
             AND  ppg.permission_key = p.key),
          'all'
        )
      -- Role default: no scope metadata, assume 'all'
      ELSE 'all'
    END
  )
  INTO v_result
  FROM public.permissions p
  WHERE (
    EXISTS (
      SELECT 1 FROM public.business_user_permissions bup
      WHERE  bup.business_user_id = v_member_id
        AND  bup.permission_key   = p.key
        AND  bup.granted          = true
    )
  ) OR (
    NOT EXISTS (
      SELECT 1 FROM public.business_user_permissions bup
      WHERE  bup.business_user_id = v_member_id
        AND  bup.permission_key   = p.key
        AND  bup.granted          = false
    )
    AND (
      (
        v_profile_id IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM public.permission_profile_grants ppg
          WHERE  ppg.profile_id = v_profile_id AND ppg.permission_key = p.key
        )
      )
      OR
      (
        v_profile_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.role_permissions rp
          WHERE  rp.role = v_role AND rp.permission_key = p.key
        )
      )
    )
  );

  RETURN COALESCE(v_result, '{}'::jsonb);
END;
$$;

-- ── 9. get_permission_scope() — single-key server-side lookup ──────────────
--
-- Convenience function for server components that need scope for one key.

CREATE OR REPLACE FUNCTION public.get_permission_scope(
  p_business_id    uuid,
  p_permission_key text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_role       text;
  v_member_id  uuid;
  v_profile_id uuid;
  v_scope      text;
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  SELECT id, role::text, permission_profile_id
  INTO   v_member_id, v_role, v_profile_id
  FROM   public.business_users
  WHERE  business_id = p_business_id
    AND  user_id     = v_user_id
    AND  is_active   = true
  LIMIT 1;

  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_role = 'owner' THEN RETURN 'all'; END IF;

  -- Check if user has this permission at all
  IF NOT public.has_permission(p_business_id, p_permission_key) THEN
    RETURN NULL;
  END IF;

  -- Return scope from profile (if profile is set)
  IF v_profile_id IS NOT NULL THEN
    SELECT ppg.scope INTO v_scope
    FROM   public.permission_profile_grants ppg
    WHERE  ppg.profile_id = v_profile_id AND ppg.permission_key = p_permission_key;
    IF FOUND THEN RETURN v_scope; END IF;
  END IF;

  RETURN 'all'; -- role default fallback
END;
$$;

-- ── 10. Update accept_business_invitation to carry permission_profile_id ───

CREATE OR REPLACE FUNCTION public.accept_business_invitation(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.business_invitations%ROWTYPE;
  v_user_id    uuid := auth.uid();
  v_email      text;
  v_membership_id uuid;
  v_person_id     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users WHERE id = v_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Could not determine authenticated user email';
  END IF;

  PERFORM public.expire_business_invitations();

  SELECT * INTO v_invitation
  FROM public.business_invitations
  WHERE id = p_invitation_id AND lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or email does not match';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending (status: %)', v_invitation.status;
  END IF;

  INSERT INTO public.business_users (
    business_id, user_id, role, relationship_type, position_id,
    is_active, membership_status, joined_at,
    permission_profile_id
  )
  VALUES (
    v_invitation.business_id, v_user_id, v_invitation.role,
    v_invitation.relationship_type, v_invitation.position_id,
    true, 'active', now(),
    v_invitation.permission_profile_id
  )
  ON CONFLICT (business_id, user_id) DO UPDATE
    SET role                   = excluded.role,
        relationship_type      = excluded.relationship_type,
        position_id            = excluded.position_id,
        is_active              = true,
        membership_status      = 'active',
        joined_at              = COALESCE(public.business_users.joined_at, now()),
        archived_at            = NULL,
        permission_profile_id  = excluded.permission_profile_id
  RETURNING id INTO v_membership_id;

  SELECT id INTO v_person_id
  FROM public.business_people
  WHERE business_id  = v_invitation.business_id
    AND lower(COALESCE(email, '')) = v_email
    AND invite_status = 'pending'
  ORDER BY created_at DESC LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO public.business_people (
      business_id, user_id, business_user_id, name, email,
      relationship_type, role, position_id, is_active,
      invite_status, status, metadata
    )
    VALUES (
      v_invitation.business_id, v_user_id, v_membership_id,
      v_email, v_invitation.email,
      v_invitation.relationship_type, v_invitation.role,
      v_invitation.position_id, true, 'accepted', 'active',
      jsonb_build_object('source', 'accepted_invitation')
    );
  ELSE
    UPDATE public.business_people
    SET user_id           = v_user_id,
        business_user_id  = v_membership_id,
        relationship_type = v_invitation.relationship_type,
        role              = v_invitation.role,
        position_id       = v_invitation.position_id,
        is_active         = true,
        invite_status     = 'accepted',
        status            = 'active'
    WHERE id = v_person_id;
  END IF;

  UPDATE public.business_invitations
  SET status = 'accepted', accepted_by = v_user_id, accepted_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.notifications (business_id, user_id, type, title, message, metadata)
  VALUES (
    v_invitation.business_id, v_invitation.created_by,
    'invitation_accepted', 'Invitation accepted',
    v_invitation.email || ' joined the business.',
    jsonb_build_object('invitation_id', p_invitation_id, 'user_id', v_user_id)
  );

  INSERT INTO public.audit_logs (business_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_invitation.business_id, v_user_id, 'create', 'business_users', v_membership_id,
    NULL,
    jsonb_build_object(
      'event', 'invitation_accepted',
      'invitation_id', p_invitation_id,
      'permission_profile_id', v_invitation.permission_profile_id
    )
  );

  RETURN v_membership_id;
END;
$$;
