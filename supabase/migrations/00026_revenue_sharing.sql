-- ============================================================================
-- REVENUE SHARING / SERVICE COMPENSATION
-- ============================================================================
--
-- Revenue remains gross service revenue. Commission and tips are tracked in
-- separate compensation records.

CREATE TYPE tip_distribution_type AS ENUM ('worker', 'business', 'shared');

CREATE TABLE public.revenue_sharing_settings (
  business_id              uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  owner_share_percent      numeric(5,2) NOT NULL DEFAULT 50,
  worker_share_percent     numeric(5,2) NOT NULL DEFAULT 50,
  tip_distribution         tip_distribution_type NOT NULL DEFAULT 'worker',
  owner_tip_share_percent  numeric(5,2) NOT NULL DEFAULT 0,
  worker_tip_share_percent numeric(5,2) NOT NULL DEFAULT 100,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT revenue_default_split_check
    CHECK (owner_share_percent + worker_share_percent = 100),
  CONSTRAINT revenue_default_percent_bounds_check
    CHECK (
      owner_share_percent BETWEEN 0 AND 100
      AND worker_share_percent BETWEEN 0 AND 100
      AND owner_tip_share_percent BETWEEN 0 AND 100
      AND worker_tip_share_percent BETWEEN 0 AND 100
    ),
  CONSTRAINT revenue_tip_split_check
    CHECK (
      tip_distribution <> 'shared'
      OR owner_tip_share_percent + worker_tip_share_percent = 100
    )
);

DROP TRIGGER IF EXISTS set_updated_at ON public.revenue_sharing_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.revenue_sharing_settings
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.service_revenue_shares (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  service_id           uuid NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  owner_share_percent  numeric(5,2) NOT NULL,
  worker_share_percent numeric(5,2) NOT NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (service_id),
  CONSTRAINT service_revenue_split_check
    CHECK (owner_share_percent + worker_share_percent = 100),
  CONSTRAINT service_revenue_percent_bounds_check
    CHECK (
      owner_share_percent BETWEEN 0 AND 100
      AND worker_share_percent BETWEEN 0 AND 100
    )
);

DROP TRIGGER IF EXISTS set_updated_at ON public.service_revenue_shares;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.service_revenue_shares
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE public.order_compensations (
  id                         uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id                uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  order_id                   uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_payment_id           uuid REFERENCES public.order_payments(id) ON DELETE SET NULL,
  service_id                 uuid REFERENCES public.services(id) ON DELETE SET NULL,
  worker_person_id           uuid REFERENCES public.business_people(id) ON DELETE SET NULL,
  worker_user_id             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  service_amount             numeric(12,2) NOT NULL,
  owner_share_percent        numeric(5,2) NOT NULL,
  worker_share_percent       numeric(5,2) NOT NULL,
  owner_revenue_share        numeric(12,2) NOT NULL,
  worker_commission_amount   numeric(12,2) NOT NULL,
  tip_amount                 numeric(12,2) NOT NULL DEFAULT 0,
  owner_tip_amount           numeric(12,2) NOT NULL DEFAULT 0,
  worker_tip_amount          numeric(12,2) NOT NULL DEFAULT 0,
  owner_total_amount         numeric(12,2) NOT NULL,
  worker_total_amount        numeric(12,2) NOT NULL,
  calculated_at              timestamptz NOT NULL DEFAULT now(),
  created_at                 timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_id)
);

ALTER TABLE public.revenue_sharing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_revenue_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_compensations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "revenue_settings_member_read" ON public.revenue_sharing_settings
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "revenue_settings_admin_write" ON public.revenue_sharing_settings
  FOR ALL USING (public.is_business_admin(business_id));

CREATE POLICY "service_revenue_member_read" ON public.service_revenue_shares
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "service_revenue_admin_write" ON public.service_revenue_shares
  FOR ALL USING (public.is_business_admin(business_id));

CREATE POLICY "order_comp_member_read" ON public.order_compensations
  FOR SELECT USING (
    CASE public.effective_scope(business_id, 'reports.view_business_revenue')
      WHEN 'all' THEN true
      WHEN 'department' THEN true
      ELSE worker_person_id = public.get_user_person_id(business_id)
    END
  );

INSERT INTO public.revenue_sharing_settings (business_id)
SELECT id FROM public.businesses
ON CONFLICT (business_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.calculate_order_compensation(
  p_order_id uuid,
  p_order_payment_id uuid
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.orders%ROWTYPE;
  v_payment public.order_payments%ROWTYPE;
  v_settings public.revenue_sharing_settings%ROWTYPE;
  v_worker_user_id uuid;
  v_owner_pct numeric(5,2);
  v_worker_pct numeric(5,2);
  v_owner_tip_pct numeric(5,2);
  v_worker_tip_pct numeric(5,2);
  v_owner_tip numeric(12,2);
  v_worker_tip numeric(12,2);
  v_comp_id uuid;
BEGIN
  SELECT * INTO v_order FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;

  SELECT * INTO v_payment FROM public.order_payments WHERE id = p_order_payment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order payment % not found', p_order_payment_id; END IF;

  INSERT INTO public.revenue_sharing_settings (business_id)
  VALUES (v_order.business_id)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT * INTO v_settings
  FROM public.revenue_sharing_settings
  WHERE business_id = v_order.business_id;

  SELECT srs.owner_share_percent, srs.worker_share_percent
  INTO v_owner_pct, v_worker_pct
  FROM public.service_revenue_shares srs
  WHERE srs.service_id = v_order.service_id;

  v_owner_pct := COALESCE(v_owner_pct, v_settings.owner_share_percent);
  v_worker_pct := COALESCE(v_worker_pct, v_settings.worker_share_percent);

  IF v_settings.tip_distribution = 'worker' THEN
    v_owner_tip_pct := 0;
    v_worker_tip_pct := 100;
  ELSIF v_settings.tip_distribution = 'business' THEN
    v_owner_tip_pct := 100;
    v_worker_tip_pct := 0;
  ELSE
    v_owner_tip_pct := v_settings.owner_tip_share_percent;
    v_worker_tip_pct := v_settings.worker_tip_share_percent;
  END IF;

  v_owner_tip := round(v_payment.tip_amount * v_owner_tip_pct / 100, 2);
  v_worker_tip := v_payment.tip_amount - v_owner_tip;

  SELECT user_id INTO v_worker_user_id
  FROM public.business_people
  WHERE id = v_order.assigned_to_person_id;

  INSERT INTO public.order_compensations (
    business_id, order_id, order_payment_id, service_id,
    worker_person_id, worker_user_id, service_amount,
    owner_share_percent, worker_share_percent,
    owner_revenue_share, worker_commission_amount,
    tip_amount, owner_tip_amount, worker_tip_amount,
    owner_total_amount, worker_total_amount
  ) VALUES (
    v_order.business_id, v_order.id, v_payment.id, v_order.service_id,
    v_order.assigned_to_person_id, v_worker_user_id, v_payment.amount_due,
    v_owner_pct, v_worker_pct,
    round(v_payment.amount_due * v_owner_pct / 100, 2),
    v_payment.amount_due - round(v_payment.amount_due * v_owner_pct / 100, 2),
    v_payment.tip_amount, v_owner_tip, v_worker_tip,
    round(v_payment.amount_due * v_owner_pct / 100, 2) + v_owner_tip,
    (v_payment.amount_due - round(v_payment.amount_due * v_owner_pct / 100, 2)) + v_worker_tip
  )
  ON CONFLICT (order_id) DO UPDATE SET
    order_payment_id = EXCLUDED.order_payment_id,
    service_id = EXCLUDED.service_id,
    worker_person_id = EXCLUDED.worker_person_id,
    worker_user_id = EXCLUDED.worker_user_id,
    service_amount = EXCLUDED.service_amount,
    owner_share_percent = EXCLUDED.owner_share_percent,
    worker_share_percent = EXCLUDED.worker_share_percent,
    owner_revenue_share = EXCLUDED.owner_revenue_share,
    worker_commission_amount = EXCLUDED.worker_commission_amount,
    tip_amount = EXCLUDED.tip_amount,
    owner_tip_amount = EXCLUDED.owner_tip_amount,
    worker_tip_amount = EXCLUDED.worker_tip_amount,
    owner_total_amount = EXCLUDED.owner_total_amount,
    worker_total_amount = EXCLUDED.worker_total_amount,
    calculated_at = now()
  RETURNING id INTO v_comp_id;

  RETURN v_comp_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_order_compensation(uuid, uuid) TO authenticated;

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
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT * INTO v_order
  FROM public.orders
  WHERE id = p_order_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Order % not found', p_order_id; END IF;
  IF v_order.completed_at IS NOT NULL THEN RAISE EXCEPTION 'Closed orders cannot collect payment'; END IF;

  v_scope := public.effective_scope(v_order.business_id, 'orders.update');
  v_person_id := public.get_user_person_id(v_order.business_id);

  IF v_scope IS NULL THEN RAISE EXCEPTION 'You do not have permission to update this order'; END IF;
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
  IF v_account_id IS NULL THEN RAISE EXCEPTION 'No active financial account configured for %', p_payment_method; END IF;

  SELECT os.id INTO v_paid_status_id
  FROM public.order_statuses os
  WHERE os.business_id = v_order.business_id
    AND lower(os.name) = 'paid'
  ORDER BY os.sort_order
  LIMIT 1;
  IF v_paid_status_id IS NULL THEN RAISE EXCEPTION 'Paid status is not configured for this business'; END IF;

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

  PERFORM public.calculate_order_compensation(v_order.id, v_payment_id);

  UPDATE public.orders
  SET status_id = v_paid_status_id
  WHERE id = v_order.id;

  RETURN v_paid_status_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_order_payment(uuid, payment_method, numeric, numeric) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_default_revenue_sharing_settings()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.revenue_sharing_settings (business_id)
  VALUES (NEW.id)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_created_revenue_sharing_settings ON public.businesses;
CREATE TRIGGER business_created_revenue_sharing_settings
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.create_default_revenue_sharing_settings();

NOTIFY pgrst, 'reload schema';
