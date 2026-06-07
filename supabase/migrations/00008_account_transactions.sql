-- ============================================================================
-- ACCOUNT TRANSACTIONS: Immutable ledger for financial account balances
-- ============================================================================

-- ── Enum ─────────────────────────────────────────────────────────────────────
CREATE TYPE account_transaction_type AS ENUM (
  'sale',          -- cash/ewallet/bank sale collected
  'credit_sale',   -- credit sale (increases AR)
  'payment',       -- customer pays outstanding (AR decreases, cash increases)
  'refund',        -- void reversal (decreases the account)
  'adjustment',    -- manual balance correction
  'transfer_in',   -- money moved in from another account
  'transfer_out'   -- money moved out to another account
);

-- ── Add cached_balance to financial_accounts ──────────────────────────────────
ALTER TABLE public.financial_accounts
  ADD COLUMN IF NOT EXISTS cached_balance numeric(12,2) NOT NULL DEFAULT 0;

-- ── account_transactions table ────────────────────────────────────────────────
-- Immutable: no UPDATE or DELETE policies. Corrections are made via 'adjustment' entries.
CREATE TABLE public.account_transactions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id       uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  account_id        uuid NOT NULL REFERENCES public.financial_accounts(id),
  transaction_type  account_transaction_type NOT NULL,
  amount            numeric(12,2) NOT NULL,  -- signed: positive = in, negative = out
  reference_type    text,                    -- 'sale', 'customer_payment', 'adjustment'
  reference_id      uuid,                    -- related record id (sale.id, etc.)
  notes             text,
  transaction_date  date NOT NULL DEFAULT CURRENT_DATE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_account_txns" ON public.account_transactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = account_transactions.business_id
        AND bu.user_id = auth.uid()
        AND bu.is_active = true
    )
  );
-- No direct INSERT/UPDATE/DELETE — all writes go through SECURITY DEFINER functions.

-- ── Trigger: keep cached_balance in sync ──────────────────────────────────────
CREATE OR REPLACE FUNCTION update_account_cached_balance()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  UPDATE public.financial_accounts
  SET cached_balance = cached_balance + NEW.amount
  WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS account_txn_update_balance ON public.account_transactions;
CREATE TRIGGER account_txn_update_balance
  AFTER INSERT ON public.account_transactions
  FOR EACH ROW EXECUTE FUNCTION update_account_cached_balance();

-- ── Trigger: auto-create account_transaction on new sale ──────────────────────
CREATE OR REPLACE FUNCTION create_account_transaction_for_sale()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.payment_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.account_transactions (
    business_id, account_id, transaction_type, amount,
    reference_type, reference_id, notes, transaction_date
  ) VALUES (
    NEW.business_id,
    NEW.payment_account_id,
    CASE WHEN NEW.payment_method = 'credit'
      THEN 'credit_sale'::account_transaction_type
      ELSE 'sale'::account_transaction_type
    END,
    NEW.total,
    'sale',
    NEW.id,
    COALESCE(NEW.receipt_number, NEW.id::text),
    NEW.created_at::date
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_create_account_transaction ON public.sales;
CREATE TRIGGER sales_create_account_transaction
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION create_account_transaction_for_sale();

-- ── Backfill: existing completed sales → account_transactions ─────────────────
INSERT INTO public.account_transactions (
  business_id, account_id, transaction_type, amount,
  reference_type, reference_id, notes, transaction_date
)
SELECT
  s.business_id,
  s.payment_account_id,
  CASE WHEN s.payment_method = 'credit'
    THEN 'credit_sale'::account_transaction_type
    ELSE 'sale'::account_transaction_type
  END,
  s.total,
  'sale',
  s.id,
  COALESCE(s.receipt_number, s.id::text),
  s.created_at::date
FROM public.sales s
WHERE s.payment_account_id IS NOT NULL
  AND s.status = 'completed';

-- Recompute cached_balance from inserted transactions
UPDATE public.financial_accounts fa
SET cached_balance = COALESCE((
  SELECT SUM(at.amount)
  FROM public.account_transactions at
  WHERE at.account_id = fa.id
), 0);

-- ── Update void_sale(): add account_transaction reversal ──────────────────────
CREATE OR REPLACE FUNCTION public.void_sale(
  p_sale_id   uuid,
  p_user_id   uuid,
  p_reason    text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_sale public.sales%ROWTYPE;
BEGIN
  SELECT * INTO v_sale FROM public.sales WHERE id = p_sale_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sale % not found', p_sale_id;
  END IF;
  IF v_sale.status <> 'completed' THEN
    RAISE EXCEPTION 'Sale % is already % and cannot be voided', p_sale_id, v_sale.status;
  END IF;

  UPDATE public.sales SET
    status      = 'voided',
    voided_at   = now(),
    voided_by   = p_user_id,
    void_reason = p_reason
  WHERE id = p_sale_id;

  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + si.quantity
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id AND p.id = si.product_id;

  INSERT INTO public.inventory_movements
    (business_id, product_id, type, quantity, reference_id, notes, created_by)
  SELECT v_sale.business_id, si.product_id, 'in', si.quantity, p_sale_id,
    'Voided sale: ' || COALESCE(v_sale.receipt_number, p_sale_id::text), p_user_id
  FROM public.sale_items si WHERE si.sale_id = p_sale_id;

  IF v_sale.payment_method = 'credit' AND v_sale.customer_id IS NOT NULL THEN
    INSERT INTO public.customer_ledger (business_id, customer_id, sale_id, type, amount, notes)
    VALUES (v_sale.business_id, v_sale.customer_id, p_sale_id, 'credit', v_sale.total,
      'Void reversal: ' || COALESCE(v_sale.receipt_number, p_sale_id::text));
    UPDATE public.customers
    SET outstanding_balance = outstanding_balance - v_sale.balance_amount
    WHERE id = v_sale.customer_id;
  END IF;

  -- Reverse the account transaction (negative amount reduces the account balance)
  IF v_sale.payment_account_id IS NOT NULL THEN
    INSERT INTO public.account_transactions (
      business_id, account_id, transaction_type, amount,
      reference_type, reference_id, notes, transaction_date
    ) VALUES (
      v_sale.business_id, v_sale.payment_account_id, 'refund', -v_sale.total,
      'sale', p_sale_id,
      'Void: ' || COALESCE(v_sale.receipt_number, p_sale_id::text),
      CURRENT_DATE
    );
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_sale TO authenticated;

-- ── record_customer_payment(): atomic payment + dual account entry ────────────
CREATE OR REPLACE FUNCTION public.record_customer_payment(
  p_business_id          uuid,
  p_customer_id          uuid,
  p_amount               numeric,
  p_receiving_account_id uuid,
  p_notes                text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_ar_account_id   uuid;
  v_customer_balance numeric;
  v_note            text;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive';
  END IF;

  SELECT outstanding_balance INTO v_customer_balance
  FROM public.customers WHERE id = p_customer_id;

  IF v_customer_balance < p_amount THEN
    RAISE EXCEPTION 'Payment amount (%) exceeds outstanding balance (%)', p_amount, v_customer_balance;
  END IF;

  SELECT id INTO v_ar_account_id
  FROM public.financial_accounts
  WHERE business_id = p_business_id AND account_type = 'receivable' AND is_active = true
  ORDER BY sort_order LIMIT 1;

  v_note := COALESCE(p_notes, 'Payment received');

  UPDATE public.customers
  SET outstanding_balance = outstanding_balance - p_amount
  WHERE id = p_customer_id;

  INSERT INTO public.customer_ledger (business_id, customer_id, type, amount, notes)
  VALUES (p_business_id, p_customer_id, 'credit', p_amount, v_note);

  -- AR account decreases (negative: money leaves receivables)
  IF v_ar_account_id IS NOT NULL THEN
    INSERT INTO public.account_transactions (
      business_id, account_id, transaction_type, amount, reference_type, notes, transaction_date
    ) VALUES (
      p_business_id, v_ar_account_id, 'payment', -p_amount,
      'customer_payment', v_note, CURRENT_DATE
    );
  END IF;

  -- Receiving account increases (positive: cash/ewallet received)
  INSERT INTO public.account_transactions (
    business_id, account_id, transaction_type, amount, reference_type, notes, transaction_date
  ) VALUES (
    p_business_id, p_receiving_account_id, 'payment', p_amount,
    'customer_payment', v_note, CURRENT_DATE
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.record_customer_payment TO authenticated;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_account_txns_account_date
  ON public.account_transactions (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_account_txns_business_date
  ON public.account_transactions (business_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_account_txns_reference
  ON public.account_transactions (reference_type, reference_id);
