-- ============================================================================
-- STAFF PERFORMANCE REPORT ACCESS
-- ============================================================================
--
-- Operators can open Reports for their own performance. Business-wide staff
-- performance remains controlled by reports.view_business_revenue.

DO $$
DECLARE
  v_sales_op_id   uuid;
  v_service_op_id uuid;
  v_rental_op_id  uuid;
BEGIN
  SELECT id INTO v_sales_op_id
  FROM public.permission_profiles
  WHERE name = 'Sales Operator' AND business_id IS NULL;

  SELECT id INTO v_service_op_id
  FROM public.permission_profiles
  WHERE name = 'Service Operator' AND business_id IS NULL;

  SELECT id INTO v_rental_op_id
  FROM public.permission_profiles
  WHERE name = 'Rental Operator' AND business_id IS NULL;

  IF v_sales_op_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_sales_op_id, 'reports.view', 'own')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'own';
  END IF;

  IF v_service_op_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_service_op_id, 'reports.view', 'assigned')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'assigned';
  END IF;

  IF v_rental_op_id IS NOT NULL THEN
    INSERT INTO public.permission_profile_grants (profile_id, permission_key, scope)
    VALUES (v_rental_op_id, 'reports.view', 'own')
    ON CONFLICT (profile_id, permission_key) DO UPDATE SET scope = 'own';
  END IF;
END;
$$;
