-- ============================================================================
-- SERVICE ORDER PAYMENT COLLECTION
-- ============================================================================
--
-- Adds a real payment collection step and records payment details separately
-- from order revenue so tips can be tracked without inflating service revenue.

-- ── 1. Ensure the default service workflow has a Collect Payment stage ───────

DO $$
DECLARE
  v_wf             RECORD;
  v_completed_id   uuid;
  v_collect_id     uuid;
  v_paid_id        uuid;
BEGIN
  FOR v_wf IN
    SELECT id, business_id
    FROM   public.workflow_definitions
    WHERE  transaction_type = 'service_order'
  LOOP
    SELECT id INTO v_completed_id
    FROM public.order_statuses
    WHERE business_id = v_wf.business_id
      AND workflow_id = v_wf.id
      AND lower(name) = 'completed'
    LIMIT 1;

    SELECT id INTO v_paid_id
    FROM public.order_statuses
    WHERE business_id = v_wf.business_id
      AND workflow_id = v_wf.id
      AND lower(name) = 'paid'
    LIMIT 1;

    SELECT id INTO v_collect_id
    FROM public.order_statuses
    WHERE business_id = v_wf.business_id
      AND workflow_id = v_wf.id
      AND lower(name) = 'collect payment'
    LIMIT 1;

    IF v_completed_id IS NOT NULL AND v_paid_id IS NOT NULL AND v_collect_id IS NULL THEN
      UPDATE public.order_statuses
      SET sort_order = sort_order + 10
      WHERE workflow_id = v_wf.id
        AND sort_order >= (
          SELECT sort_order FROM public.order_statuses WHERE id = v_paid_id
        );

      INSERT INTO public.order_statuses
        (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
      VALUES (
        v_wf.business_id,
        v_wf.id,
        'Collect Payment',
        (SELECT sort_order FROM public.order_statuses WHERE id = v_completed_id) + 10,
        'orange',
        false,
        false
      )
      RETURNING id INTO v_collect_id;

      DELETE FROM public.workflow_transitions
      WHERE workflow_id = v_wf.id
        AND from_status_id = v_completed_id
        AND to_status_id = v_paid_id;

      INSERT INTO public.workflow_transitions
        (workflow_id, from_status_id, to_status_id, label, sort_order)
      VALUES
        (v_wf.id, v_completed_id, v_collect_id, 'Collect Payment', 3),
        (v_wf.id, v_collect_id,   v_paid_id,    'Record Payment',  4)
      ON CONFLICT (workflow_id, from_status_id, to_status_id) DO UPDATE
      SET label = EXCLUDED.label,
          sort_order = EXCLUDED.sort_order;
    END IF;
  END LOOP;
END;
$$;

-- ── 2. Payment records ─────────────────────────────────────────────────────

INSERT INTO public.financial_accounts (business_id, name, account_type, legacy_method, sort_order)
SELECT b.id, 'Bank Account', 'bank', 'bank_transfer', 5
FROM public.businesses b
ON CONFLICT (business_id, name) DO NOTHING;

CREATE TABLE public.order_payments (
  id                 uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id        uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id           uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method     payment_method NOT NULL,
  amount_due         numeric(12,2) NOT NULL,
  amount_received    numeric(12,2) NOT NULL DEFAULT 0,
  change_given       numeric(12,2) NOT NULL DEFAULT 0,
  tip_amount         numeric(12,2) NOT NULL DEFAULT 0,
  collected_by       uuid NOT NULL REFERENCES auth.users(id),
  collected_at       timestamptz NOT NULL DEFAULT now(),
  financial_account_id uuid NOT NULL REFERENCES public.financial_accounts(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.order_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "order_payments_member_read" ON public.order_payments
  FOR SELECT USING (public.is_business_member(business_id));

CREATE INDEX IF NOT EXISTS idx_order_payments_business_date
  ON public.order_payments (business_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_order_payments_collector
  ON public.order_payments (business_id, collected_by, collected_at DESC);

-- ── 3. Atomic collection + ledger posting + status advance ─────────────────

CREATE OR REPLACE FUNCTION public.record_order_payment(
  p_order_id         uuid,
  p_payment_method   payment_method,
  p_amount_received  numeric DEFAULT NULL,
  p_tip_amount       numeric DEFAULT 0
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order              public.orders%ROWTYPE;
  v_scope              text;
  v_person_id          uuid;
  v_account_id         uuid;
  v_amount_due         numeric(12,2);
  v_amount_received    numeric(12,2);
  v_tip_amount         numeric(12,2);
  v_change_given       numeric(12,2);
  v_payment_id         uuid;
  v_paid_status_id     uuid;
  v_has_comp_function   boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  IF v_order.completed_at IS NOT NULL THEN
    RAISE EXCEPTION 'Closed orders cannot collect payment';
  END IF;

  v_scope := public.effective_scope(v_order.business_id, 'orders.update');
  v_person_id := public.get_user_person_id(v_order.business_id);

  IF v_scope IS NULL THEN
    RAISE EXCEPTION 'You do not have permission to update this order';
  END IF;

  IF v_scope = 'assigned' AND v_order.assigned_to_person_id IS DISTINCT FROM v_person_id THEN
    RAISE EXCEPTION 'You can only collect payment for orders assigned to you';
  END IF;

  IF v_scope = 'own' AND v_order.created_by IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'You can only collect payment for orders you created';
  END IF;

  v_amount_due := COALESCE(v_order.total_amount, 0);
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
  WHERE business_id = v_order.business_id
    AND legacy_method = p_payment_method::text
    AND is_active = true
  ORDER BY sort_order
  LIMIT 1;

  IF v_account_id IS NULL THEN
    RAISE EXCEPTION 'No active financial account configured for %', p_payment_method;
  END IF;

  SELECT os.id INTO v_paid_status_id
  FROM public.order_statuses os
  WHERE os.business_id = v_order.business_id
    AND lower(os.name) = 'paid'
  ORDER BY os.sort_order
  LIMIT 1;

  IF v_paid_status_id IS NULL THEN
    RAISE EXCEPTION 'Paid status is not configured for this business';
  END IF;

  INSERT INTO public.order_payments (
    business_id, order_id, payment_method, amount_due, amount_received,
    change_given, tip_amount, collected_by, financial_account_id
  ) VALUES (
    v_order.business_id, v_order.id, p_payment_method, v_amount_due,
    v_amount_received, v_change_given, v_tip_amount, auth.uid(), v_account_id
  )
  RETURNING id INTO v_payment_id;

  INSERT INTO public.account_transactions (
    business_id, account_id, transaction_type, amount,
    reference_type, reference_id, notes, transaction_date
  ) VALUES (
    v_order.business_id,
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
    v_payment_id,
    'Order payment: ' || v_order.id::text,
    CURRENT_DATE
  );

  UPDATE public.orders
  SET status_id = v_paid_status_id
  WHERE id = v_order.id;

  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'calculate_order_compensation'
  ) INTO v_has_comp_function;

  IF v_has_comp_function THEN
    PERFORM public.calculate_order_compensation(v_order.id, v_payment_id);
  END IF;

  RETURN v_paid_status_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, payment_method, numeric, numeric) TO authenticated;

NOTIFY pgrst, 'reload schema';
