-- ============================================================================
-- PAYMENT CORRECTIONS
-- ============================================================================
--
-- Payments are immutable for accounting. Corrections void the original payment,
-- reverse its account posting, create a replacement payment, and recalculate
-- compensation from the replacement.

CREATE TYPE order_payment_status AS ENUM ('active', 'voided');

CREATE TABLE public.payment_correction_settings (
  business_id              uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  operator_time_limit_mins integer NOT NULL DEFAULT 15 CHECK (operator_time_limit_mins >= 0),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.payment_correction_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.payment_correction_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payment_correction_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_correction_settings_member_read" ON public.payment_correction_settings
  FOR SELECT USING (public.is_business_member(business_id));

CREATE POLICY "payment_correction_settings_admin_write" ON public.payment_correction_settings
  FOR ALL USING (public.is_business_admin(business_id));

INSERT INTO public.payment_correction_settings (business_id)
SELECT id FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;

ALTER TABLE public.order_payments
  ADD COLUMN IF NOT EXISTS status order_payment_status NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS voided_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason text,
  ADD COLUMN IF NOT EXISTS replacement_payment_id uuid REFERENCES public.order_payments(id);

ALTER TABLE public.order_payments
  DROP CONSTRAINT IF EXISTS order_payments_order_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_one_active_per_order
  ON public.order_payments (order_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_order_payments_order_status
  ON public.order_payments (order_id, status, collected_at DESC);

DROP POLICY IF EXISTS "order_payments_member_read" ON public.order_payments;

CREATE POLICY "order_payments_scope_read" ON public.order_payments
  FOR SELECT USING (
    CASE public.effective_scope(business_id, 'reports.view_business_revenue')
      WHEN 'all' THEN true
      WHEN 'department' THEN true
      ELSE collected_by = auth.uid()
    END
  );

CREATE TABLE public.payment_corrections (
  id                     uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id            uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id               uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  original_payment_id    uuid NOT NULL REFERENCES public.order_payments(id),
  replacement_payment_id uuid NOT NULL REFERENCES public.order_payments(id),
  reason                 text NOT NULL CHECK (length(trim(reason)) > 0),
  corrected_by           uuid NOT NULL REFERENCES auth.users(id),
  corrected_at           timestamptz NOT NULL DEFAULT now(),
  created_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payment_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_corrections_member_read" ON public.payment_corrections
  FOR SELECT USING (
    CASE public.effective_scope(business_id, 'reports.view_business_revenue')
      WHEN 'all' THEN true
      WHEN 'department' THEN true
      ELSE corrected_by = auth.uid()
    END
  );

CREATE INDEX IF NOT EXISTS idx_payment_corrections_order
  ON public.payment_corrections (order_id, corrected_at DESC);

CREATE OR REPLACE FUNCTION public.create_default_payment_correction_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.payment_correction_settings (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_created_payment_correction_settings ON public.businesses;
CREATE TRIGGER business_created_payment_correction_settings
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.create_default_payment_correction_settings();

CREATE OR REPLACE FUNCTION public.correct_order_payment(
  p_original_payment_id uuid,
  p_payment_method      payment_method,
  p_amount_received     numeric DEFAULT NULL,
  p_tip_amount          numeric DEFAULT 0,
  p_reason              text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_original           public.order_payments%ROWTYPE;
  v_order              public.orders%ROWTYPE;
  v_scope              text;
  v_role               text;
  v_can_correct_any    boolean := false;
  v_limit_mins         integer;
  v_account_id         uuid;
  v_amount_due         numeric(12,2);
  v_amount_received    numeric(12,2);
  v_tip_amount         numeric(12,2);
  v_change_given       numeric(12,2);
  v_replacement_id     uuid;
  v_paid_status_id     uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_reason IS NULL OR length(trim(p_reason)) = 0 THEN
    RAISE EXCEPTION 'Correction reason is required';
  END IF;

  SELECT * INTO v_original
  FROM public.order_payments
  WHERE id = p_original_payment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found', p_original_payment_id;
  END IF;

  IF v_original.status <> 'active' THEN
    RAISE EXCEPTION 'Only active payments can be corrected';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = v_original.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', v_original.order_id;
  END IF;

  IF v_order.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Closed orders cannot correct payment';
  END IF;

  v_scope := public.effective_scope(v_original.business_id, 'orders.update');

  SELECT role::text INTO v_role
  FROM public.business_users
  WHERE business_id = v_original.business_id
    AND user_id = auth.uid()
    AND is_active = true
  LIMIT 1;

  v_can_correct_any := v_role IN ('owner', 'manager') OR v_scope IN ('all', 'department');

  IF v_scope IS NULL AND NOT v_can_correct_any THEN
    RAISE EXCEPTION 'You do not have permission to correct this payment';
  END IF;

  INSERT INTO public.payment_correction_settings (business_id)
  VALUES (v_original.business_id)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT operator_time_limit_mins INTO v_limit_mins
  FROM public.payment_correction_settings
  WHERE business_id = v_original.business_id;

  IF NOT v_can_correct_any THEN
    IF v_original.collected_by IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'You can only correct payments you collected';
    END IF;

    IF now() > v_original.collected_at + make_interval(mins => v_limit_mins) THEN
      RAISE EXCEPTION 'Payment correction window has expired';
    END IF;
  END IF;

  v_amount_due := v_original.amount_due;
  v_tip_amount := GREATEST(COALESCE(p_tip_amount, 0), 0);
  v_amount_received := COALESCE(p_amount_received, 0);

  IF p_payment_method = 'credit' THEN
    v_amount_received := 0;
    v_tip_amount := 0;
    v_change_given := 0;
  ELSIF p_payment_method = 'cash' THEN
    IF v_amount_received < (v_amount_due + v_tip_amount) THEN
      RAISE EXCEPTION 'Cash received must cover amount due plus tip';
    END IF;
    v_change_given := v_amount_received - v_amount_due - v_tip_amount;
  ELSE
    IF v_amount_received <> (v_amount_due + v_tip_amount) THEN
      RAISE EXCEPTION 'Digital payment received must equal amount due plus tip';
    END IF;
    v_change_given := 0;
  END IF;

  SELECT id INTO v_account_id
  FROM public.financial_accounts
  WHERE business_id = v_original.business_id
    AND legacy_method = p_payment_method::text
    AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No active financial account configured for %', p_payment_method;
  END IF;

  SELECT os.id INTO v_paid_status_id
  FROM public.order_statuses os
  WHERE os.business_id = v_original.business_id
    AND lower(os.name) = 'paid'
  ORDER BY os.sort_order
  LIMIT 1;

  IF v_paid_status_id IS NULL THEN
    RAISE EXCEPTION 'Paid status is not configured for this business';
  END IF;

  UPDATE public.order_payments
  SET status = 'voided',
      voided_at = now(),
      voided_by = auth.uid(),
      void_reason = trim(p_reason)
  WHERE id = v_original.id;

  INSERT INTO public.account_transactions (
    business_id, account_id, transaction_type, amount,
    reference_type, reference_id, notes, transaction_date
  ) VALUES (
    v_original.business_id,
    v_original.financial_account_id,
    'refund',
    CASE WHEN v_original.payment_method = 'credit'
      THEN -v_original.amount_due
      ELSE -(v_original.amount_due + v_original.tip_amount)
    END,
    'order_payment_correction',
    v_original.id,
    'Void order payment correction: ' || v_original.order_id::text,
    CURRENT_DATE
  );

  INSERT INTO public.order_payments (
    business_id, order_id, payment_method, amount_due, amount_received,
    change_given, tip_amount, collected_by, financial_account_id
  ) VALUES (
    v_original.business_id, v_original.order_id, p_payment_method, v_amount_due,
    v_amount_received, v_change_given, v_tip_amount, auth.uid(), v_account_id
  )
  RETURNING id INTO v_replacement_id;

  UPDATE public.order_payments
  SET replacement_payment_id = v_replacement_id
  WHERE id = v_original.id;

  INSERT INTO public.account_transactions (
    business_id, account_id, transaction_type, amount,
    reference_type, reference_id, notes, transaction_date
  ) VALUES (
    v_original.business_id,
    v_account_id,
    CASE WHEN p_payment_method = 'credit'
      THEN 'credit_sale'::account_transaction_type
      ELSE 'sale'::account_transaction_type
    END,
    CASE WHEN p_payment_method = 'credit'
      THEN v_amount_due
      ELSE v_amount_due + v_tip_amount
    END,
    'order_payment',
    v_replacement_id,
    'Replacement order payment: ' || v_original.order_id::text,
    CURRENT_DATE
  );

  INSERT INTO public.payment_corrections (
    business_id, order_id, original_payment_id, replacement_payment_id,
    reason, corrected_by
  ) VALUES (
    v_original.business_id, v_original.order_id, v_original.id, v_replacement_id,
    trim(p_reason), auth.uid()
  );

  PERFORM public.calculate_order_compensation(v_original.order_id, v_replacement_id);

  UPDATE public.orders
  SET status_id = v_paid_status_id
  WHERE id = v_original.order_id;

  RETURN v_replacement_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.correct_order_payment(uuid, payment_method, numeric, numeric, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
