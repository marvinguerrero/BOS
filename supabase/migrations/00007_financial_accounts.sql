-- ============================================================================
-- FINANCIAL ACCOUNTS: Track where money is received per business
-- ============================================================================

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE financial_account_type AS ENUM ('cash', 'ewallet', 'bank', 'receivable');

-- Extend payment_method for bank transfers (safe — ADD VALUE IF NOT EXISTS)
ALTER TYPE payment_method ADD VALUE IF NOT EXISTS 'bank_transfer';

-- ── financial_accounts table ──────────────────────────────────────────────────
CREATE TABLE public.financial_accounts (
  id             uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id    uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name           text NOT NULL,
  account_type   financial_account_type NOT NULL,
  -- Stores the legacy payment_method value so existing widgets/reports still work.
  -- cash→'cash', ewallet→'gcash'/'maya', bank→'bank_transfer', receivable→'credit'
  legacy_method  text NOT NULL DEFAULT 'cash',
  is_active      boolean NOT NULL DEFAULT true,
  sort_order     smallint NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members_select_accounts" ON public.financial_accounts
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = financial_accounts.business_id
        AND bu.user_id = auth.uid()
        AND bu.is_active = true
    )
  );

CREATE POLICY "owners_manage_accounts" ON public.financial_accounts
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.business_users bu
      WHERE bu.business_id = financial_accounts.business_id
        AND bu.user_id = auth.uid()
        AND bu.role = 'owner'
        AND bu.is_active = true
    )
  );

-- ── payment_account_id on sales ───────────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_account_id uuid REFERENCES public.financial_accounts(id);

-- ── Default accounts helper ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_default_financial_accounts(p_business_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
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

-- Create defaults for all existing businesses
DO $$
DECLARE
  biz record;
BEGIN
  FOR biz IN SELECT id FROM public.businesses LOOP
    PERFORM public.create_default_financial_accounts(biz.id);
  END LOOP;
END;
$$;

-- ── Trigger: auto-create defaults when a new business is inserted ─────────────
CREATE OR REPLACE FUNCTION public.on_business_created_create_accounts()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM public.create_default_financial_accounts(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS business_created_create_accounts ON public.businesses;
CREATE TRIGGER business_created_create_accounts
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.on_business_created_create_accounts();

-- ── Backfill: match existing sales to their account by legacy_method ──────────
-- Uses the first matching active account per business for each payment_method.
-- credit sales → Accounts Receivable, cash → Cash Drawer, etc.
UPDATE public.sales s
SET payment_account_id = (
  SELECT fa.id
  FROM public.financial_accounts fa
  WHERE fa.business_id = s.business_id
    AND fa.legacy_method = s.payment_method::text
    AND fa.is_active = true
  ORDER BY fa.sort_order
  LIMIT 1
)
WHERE s.payment_account_id IS NULL;

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_financial_accounts_business
  ON public.financial_accounts (business_id, is_active);

CREATE INDEX IF NOT EXISTS idx_sales_payment_account
  ON public.sales (payment_account_id);
