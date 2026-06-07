-- ============================================================================
-- SALES ENHANCEMENT: Transaction ledger, audit trail, BIR-ready schema
-- ============================================================================

-- ── New enums ─────────────────────────────────────────────────────────────────
CREATE TYPE sale_status AS ENUM ('completed', 'voided', 'refunded');
CREATE TYPE sale_payment_status AS ENUM ('completed', 'outstanding', 'partially_paid');

-- ── Receipt number sequence (global; formatted as INV-000001) ─────────────────
CREATE SEQUENCE IF NOT EXISTS sales_receipt_seq START 1;

-- ── Enhance sales table ───────────────────────────────────────────────────────
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS receipt_number          text,
  ADD COLUMN IF NOT EXISTS status                  sale_status NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS payment_status          sale_payment_status NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS amount_paid             numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS balance_amount          numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS customer_name_snapshot  text,
  ADD COLUMN IF NOT EXISTS tax_amount              numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS voided_at               timestamptz,
  ADD COLUMN IF NOT EXISTS voided_by               uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS void_reason             text,
  -- BIR fields — nullable, reserved for compliance phase
  ADD COLUMN IF NOT EXISTS official_receipt_no     text,
  ADD COLUMN IF NOT EXISTS invoice_no              text,
  ADD COLUMN IF NOT EXISTS vat_amount              numeric(12,2),
  ADD COLUMN IF NOT EXISTS vat_exempt_amount       numeric(12,2),
  ADD COLUMN IF NOT EXISTS zero_rated_amount       numeric(12,2),
  ADD COLUMN IF NOT EXISTS discount_type           text,
  ADD COLUMN IF NOT EXISTS discount_reference      text,
  ADD COLUMN IF NOT EXISTS bir_reference_no        text,
  ADD COLUMN IF NOT EXISTS bir_acknowledgement_no  text;

-- ── Enhance sale_items table ──────────────────────────────────────────────────
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS product_name_snapshot  text,
  ADD COLUMN IF NOT EXISTS product_sku_snapshot   text;

-- ── Backfill: receipt_number for existing rows ────────────────────────────────
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) AS rn
  FROM public.sales
)
UPDATE public.sales s
SET receipt_number = 'INV-' || LPAD(n.rn::text, 6, '0')
FROM numbered n
WHERE s.id = n.id;

-- Advance sequence past existing row count so next INSERT gets the right number
SELECT setval('sales_receipt_seq', COALESCE((SELECT COUNT(*) FROM public.sales), 0) + 1);

-- ── Backfill: payment_status and paid/balance amounts ─────────────────────────
UPDATE public.sales SET
  payment_status = CASE
    WHEN payment_method = 'credit' THEN 'outstanding'::sale_payment_status
    ELSE 'completed'::sale_payment_status
  END,
  amount_paid   = CASE WHEN payment_method = 'credit' THEN 0 ELSE total END,
  balance_amount = CASE WHEN payment_method = 'credit' THEN total ELSE 0 END;

-- ── Backfill: customer_name_snapshot ─────────────────────────────────────────
UPDATE public.sales s
SET customer_name_snapshot = c.name
FROM public.customers c
WHERE s.customer_id = c.id
  AND s.customer_name_snapshot IS NULL;

-- ── Backfill: product snapshots on sale_items ─────────────────────────────────
UPDATE public.sale_items si
SET product_name_snapshot = p.name,
    product_sku_snapshot  = p.sku
FROM public.products p
WHERE si.product_id = p.id;

-- ── Trigger: auto-set receipt_number before INSERT ───────────────────────────
CREATE OR REPLACE FUNCTION set_sale_receipt_number()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.receipt_number IS NULL THEN
    NEW.receipt_number := 'INV-' || LPAD(nextval('sales_receipt_seq')::text, 6, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sales_set_receipt_number ON public.sales;
CREATE TRIGGER sales_set_receipt_number
  BEFORE INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION set_sale_receipt_number();

-- ── Function: void_sale ───────────────────────────────────────────────────────
-- SECURITY DEFINER: executes as the function owner so it can UPDATE sales
-- even though the generated TS types mark Update as Record<string, never>.
-- Also reverses inventory and credit ledger entries atomically.
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

  -- Mark sale as voided
  UPDATE public.sales SET
    status      = 'voided',
    voided_at   = now(),
    voided_by   = p_user_id,
    void_reason = p_reason
  WHERE id = p_sale_id;

  -- Restore inventory for each line item
  UPDATE public.products p
  SET stock_quantity = p.stock_quantity + si.quantity
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id AND p.id = si.product_id;

  -- Record inventory movement for each restored item
  INSERT INTO public.inventory_movements
    (business_id, product_id, type, quantity, reference_id, notes, created_by)
  SELECT
    v_sale.business_id,
    si.product_id,
    'in',
    si.quantity,
    p_sale_id,
    'Voided sale: ' || COALESCE(v_sale.receipt_number, p_sale_id::text),
    p_user_id
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id;

  -- Reverse credit ledger entry if it was a credit sale
  IF v_sale.payment_method = 'credit' AND v_sale.customer_id IS NOT NULL THEN
    INSERT INTO public.customer_ledger
      (business_id, customer_id, sale_id, type, amount, notes)
    VALUES
      (v_sale.business_id, v_sale.customer_id, p_sale_id, 'credit', v_sale.total,
       'Void reversal: ' || COALESCE(v_sale.receipt_number, p_sale_id::text));

    UPDATE public.customers
    SET outstanding_balance = outstanding_balance - v_sale.balance_amount
    WHERE id = v_sale.customer_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.void_sale TO authenticated;

-- ── Index: faster history queries ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sales_business_created
  ON public.sales (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sales_receipt_number
  ON public.sales (receipt_number);

CREATE INDEX IF NOT EXISTS idx_sales_status
  ON public.sales (business_id, status);
