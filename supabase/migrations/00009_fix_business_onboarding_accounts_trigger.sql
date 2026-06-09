-- ============================================================================
-- ONBOARDING BOOTSTRAP: let the business-created trigger create default accounts
-- ============================================================================
--
-- The onboarding flow inserts the first business row before the owner
-- membership row can exist. The AFTER INSERT trigger on businesses creates
-- default financial accounts immediately, so that nested insert must not depend
-- on the not-yet-created business_users owner row.

CREATE OR REPLACE FUNCTION public.create_default_financial_accounts(p_business_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.financial_accounts (business_id, name, account_type, legacy_method, sort_order)
  VALUES
    (p_business_id, 'Cash Drawer',         'cash',       'cash',         1),
    (p_business_id, 'GCash',               'ewallet',    'gcash',        2),
    (p_business_id, 'Maya',                'ewallet',    'maya',         3),
    (p_business_id, 'Accounts Receivable', 'receivable', 'credit',       4)
  ON CONFLICT (business_id, name) DO NOTHING;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_business_created_create_accounts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.create_default_financial_accounts(NEW.id);
  RETURN NEW;
END;
$$;
