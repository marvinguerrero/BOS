-- ============================================================================
-- CUSTOMER ENHANCEMENT: walk-in, guest, and registered transaction snapshots
-- ============================================================================
--
-- Customer records remain optional for cash/service transactions. Sales and
-- orders keep historical customer snapshots without creating customer rows for
-- walk-in or guest customers.

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'walk_in',
  ADD COLUMN IF NOT EXISTS customer_mobile_snapshot text;

UPDATE public.sales s
SET customer_name_snapshot = c.name
FROM public.customers c
WHERE s.customer_id = c.id
  AND s.customer_name_snapshot IS NULL;

UPDATE public.sales s
SET customer_mobile_snapshot = c.contact_number
FROM public.customers c
WHERE s.customer_id = c.id
  AND s.customer_mobile_snapshot IS NULL;

UPDATE public.sales
SET customer_name_snapshot = 'Walk-in Customer'
WHERE customer_id IS NULL
  AND customer_name_snapshot IS NULL;

UPDATE public.sales
SET customer_type = CASE
  WHEN customer_id IS NOT NULL THEN 'registered'
  WHEN customer_name_snapshot IS NULL
    OR btrim(customer_name_snapshot) = ''
    OR customer_name_snapshot = 'Walk-in Customer'
    THEN 'walk_in'
  ELSE 'guest'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'sales_customer_type_check'
      AND conrelid = 'public.sales'::regclass
  ) THEN
    ALTER TABLE public.sales
      ADD CONSTRAINT sales_customer_type_check
      CHECK (customer_type IN ('walk_in', 'guest', 'registered'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_sales_customer_type
  ON public.sales (business_id, customer_type);

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS customer_type text NOT NULL DEFAULT 'guest',
  ADD COLUMN IF NOT EXISTS customer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS customer_mobile_snapshot text;

ALTER TABLE public.orders
  ALTER COLUMN customer_name DROP NOT NULL;

UPDATE public.orders o
SET customer_name_snapshot = c.name
FROM public.customers c
WHERE o.customer_id = c.id
  AND o.customer_name_snapshot IS NULL;

UPDATE public.orders o
SET customer_mobile_snapshot = c.contact_number
FROM public.customers c
WHERE o.customer_id = c.id
  AND o.customer_mobile_snapshot IS NULL;

UPDATE public.orders
SET customer_name_snapshot = COALESCE(NULLIF(btrim(customer_name), ''), 'Walk-in Customer')
WHERE customer_name_snapshot IS NULL;

UPDATE public.orders
SET customer_mobile_snapshot = customer_contact
WHERE customer_mobile_snapshot IS NULL;

UPDATE public.orders
SET customer_type = CASE
  WHEN customer_id IS NOT NULL THEN 'registered'
  WHEN customer_name_snapshot IS NULL
    OR btrim(customer_name_snapshot) = ''
    OR customer_name_snapshot = 'Walk-in Customer'
    THEN 'walk_in'
  ELSE 'guest'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_customer_type_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_customer_type_check
      CHECK (customer_type IN ('walk_in', 'guest', 'registered'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_orders_customer_type
  ON public.orders (business_id, customer_type);
