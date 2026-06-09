-- ============================================================================
-- ASSIGNMENT ENFORCEMENT
-- ============================================================================
--
-- Enforces that users without the `{module}.assign` permission are
-- automatically set as the assignee when creating or updating records.
-- Users WITH the permission can freely choose any assignee.
--
-- Current tables covered: orders
-- Future tables (rooms, tasks, work_orders) follow the same pattern.
--
-- Rule applied in a BEFORE INSERT OR UPDATE trigger (server-side, unfakeable):
--   has_permission(business_id, 'orders.assign') = false
--     → assigned_to_person_id = current user's business_people.id
--     → assigned_position_id  = current user's position_id
--
-- Frontend should mirror this by hiding or disabling the Assigned To field.
-- Backend enforcement is authoritative; frontend is UX only.

-- ── 1. New permission keys ─────────────────────────────────────────────────

INSERT INTO public.permissions (key, module_key, action, description) VALUES
  ('orders.assign', 'orders', 'assign', 'Choose who an order is assigned to')
ON CONFLICT (key) DO NOTHING;

-- ── 2. Role defaults for the new permission ────────────────────────────────
-- owners and managers can assign; staff and viewers cannot.

INSERT INTO public.role_permissions (role, permission_key)
VALUES
  ('owner',   'orders.assign'),
  ('manager', 'orders.assign')
ON CONFLICT (role, permission_key) DO NOTHING;

-- ── 3. Profile grants for the new permission ───────────────────────────────

DO $$
DECLARE
  v_ops_mgr_id  uuid;
  v_biz_mgr_id  uuid;
  v_owner_id    uuid;
BEGIN
  SELECT id INTO v_ops_mgr_id FROM public.permission_profiles WHERE name = 'Operations Manager' AND business_id IS NULL;
  SELECT id INTO v_biz_mgr_id FROM public.permission_profiles WHERE name = 'Business Manager'   AND business_id IS NULL;
  SELECT id INTO v_owner_id   FROM public.permission_profiles WHERE name = 'Owner'              AND business_id IS NULL;

  IF v_ops_mgr_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_ops_mgr_id, 'orders.assign', 'all')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'all';
  END IF;

  IF v_biz_mgr_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_biz_mgr_id, 'orders.assign', 'all')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'all';
  END IF;

  IF v_owner_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_owner_id, 'orders.assign', 'all')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'all';
  END IF;
END;
$$;

-- ── 4. Helper: current user's business_people id ──────────────────────────

CREATE OR REPLACE FUNCTION public.get_user_person_id(p_business_id uuid)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT id
  FROM   public.business_people
  WHERE  business_id = p_business_id
    AND  user_id     = auth.uid()
    AND  is_active   = true
  ORDER BY created_at
  LIMIT 1;
$$;

-- ── 5. Trigger function: enforce assignment on orders ──────────────────────

CREATE OR REPLACE FUNCTION public.enforce_order_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_person_id    uuid;
  v_position_id  uuid;
BEGIN
  -- Skip enforcement when called outside a user session (e.g. migrations, service role)
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Owner role always bypasses enforcement (has_permission would return true anyway,
  -- but this short-circuit avoids the extra query for the common case).
  IF EXISTS (
    SELECT 1 FROM public.business_users
    WHERE  business_id = NEW.business_id
      AND  user_id     = auth.uid()
      AND  role        = 'owner'
      AND  is_active   = true
  ) THEN
    RETURN NEW;
  END IF;

  -- If the user has the assign permission, respect their submitted value.
  IF public.has_permission(NEW.business_id, 'orders.assign') THEN
    RETURN NEW;
  END IF;

  -- No assign permission → override to the current user's business_people record.
  SELECT id, position_id
  INTO   v_person_id, v_position_id
  FROM   public.business_people
  WHERE  business_id = NEW.business_id
    AND  user_id     = auth.uid()
    AND  is_active   = true
  ORDER BY created_at
  LIMIT 1;

  -- If no business_people record found (e.g. owner without a people entry), leave as-is.
  IF v_person_id IS NULL THEN
    RETURN NEW;
  END IF;

  NEW.assigned_to_person_id := v_person_id;
  NEW.assigned_position_id  := v_position_id;

  RETURN NEW;
END;
$$;

-- ── 6. Apply trigger to orders ─────────────────────────────────────────────

DROP TRIGGER IF EXISTS enforce_assignment ON public.orders;

CREATE TRIGGER enforce_assignment
  BEFORE INSERT OR UPDATE OF assigned_to_person_id
  ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_order_assignment();
