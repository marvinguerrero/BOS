-- ============================================================================
-- SERVICE OPERATOR POS ACCESS
-- ============================================================================
--
-- ROOT CAUSE
-- ──────────
-- effective_scope() (migration 00019) stops at RETURN NULL when the user has a
-- permission_profile_id and that profile does not contain the requested key.
-- It does NOT fall through to role_permissions in this case.
--
-- Service Operator profile was intentionally omitted from sales.create / sales.view
-- (migration 00020 comment: "Sales Operators have sales.create; Service Operators
-- do not"). This separation assumes dedicated roles, which does not match the
-- reality of Filipino small businesses where the same person handles both service
-- work and product sales at the counter.
--
-- FIX
-- ───
-- Add sales.create (own) and sales.view (own) to the global Service Operator
-- profile so that operators can use the POS to sell products. Scope is 'own'
-- so they can only view and manage their own transactions.

DO $$
DECLARE
  v_svc_op_id uuid;
BEGIN
  SELECT id INTO v_svc_op_id
  FROM   public.permission_profiles
  WHERE  name = 'Service Operator'
    AND  business_id IS NULL;

  IF v_svc_op_id IS NULL THEN
    RAISE NOTICE 'Service Operator global profile not found — skipping';
    RETURN;
  END IF;

  INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
  VALUES
    (v_svc_op_id, 'sales.create', 'own'),
    (v_svc_op_id, 'sales.view',   'own')
  ON CONFLICT (profile_id, permission_key) DO UPDATE
    SET scope = EXCLUDED.scope;
END;
$$;

NOTIFY pgrst, 'reload schema';
