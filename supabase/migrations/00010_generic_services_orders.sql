-- ============================================================================
-- MODULE PLATFORM: generic services, configurable order statuses, generic orders
-- ============================================================================
--
-- This migration introduces module-driven service/order tables and backfills the
-- existing laundry-specific data without dropping or mutating legacy tables.

ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'services';
ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'orders';

CREATE TABLE IF NOT EXISTS public.services (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  price            numeric(12,2) NOT NULL DEFAULT 0,
  duration_minutes integer,
  is_active        boolean NOT NULL DEFAULT true,
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS public.order_statuses (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  sort_order  integer NOT NULL DEFAULT 0,
  color       text,
  is_default  boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

CREATE TABLE IF NOT EXISTS public.orders (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id      uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name    text NOT NULL,
  customer_contact text,
  service_id       uuid REFERENCES public.services(id) ON DELETE SET NULL,
  status_id        uuid REFERENCES public.order_statuses(id) ON DELETE SET NULL,
  total_amount     numeric(12,2) NOT NULL DEFAULT 0,
  notes            text,
  received_at      timestamptz NOT NULL DEFAULT now(),
  completed_at     timestamptz,
  created_by       uuid NOT NULL REFERENCES auth.users(id),
  metadata         jsonb NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_services_business_active
  ON public.services (business_id, is_active);
CREATE INDEX IF NOT EXISTS idx_order_statuses_business_sort
  ON public.order_statuses (business_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_orders_business_created
  ON public.orders (business_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_business_status
  ON public.orders (business_id, status_id);
CREATE INDEX IF NOT EXISTS idx_orders_service
  ON public.orders (service_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.services;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.services
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.orders;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "services_member_read" ON public.services
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "services_admin_write" ON public.services
  FOR ALL USING (public.is_business_admin(business_id));

CREATE POLICY "order_statuses_member_read" ON public.order_statuses
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "order_statuses_admin_write" ON public.order_statuses
  FOR ALL USING (public.is_business_admin(business_id));

CREATE POLICY "orders_member_read" ON public.orders
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "orders_member_write" ON public.orders
  FOR ALL USING (public.is_business_member(business_id));

-- Bootstrap policies let the onboarding creator seed module configuration
-- before the owner membership row exists.
CREATE POLICY "services_creator_bootstrap" ON public.services
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND b.created_by = auth.uid()
    )
  );

CREATE POLICY "order_statuses_creator_bootstrap" ON public.order_statuses
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND b.created_by = auth.uid()
    )
  );

CREATE POLICY "orders_creator_bootstrap" ON public.orders
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND b.created_by = auth.uid()
    )
  );

-- Backfill services from legacy laundry_services. Keep UUIDs so existing order
-- service references can be migrated without a lookup table.
INSERT INTO public.services (
  id,
  business_id,
  name,
  price,
  is_active,
  metadata,
  created_at
)
SELECT
  id,
  business_id,
  name,
  price,
  is_active,
  jsonb_build_object('legacy_source', 'laundry_services', 'pricing_type', pricing_type),
  created_at
FROM public.laundry_services
ON CONFLICT (id) DO NOTHING;

-- Backfill configurable statuses for each business that has laundry orders.
WITH status_seed(name, sort_order, color, is_default, legacy_status) AS (
  VALUES
    ('Received',  10, 'blue',   true,  'received'::laundry_order_status),
    ('Washing',   20, 'yellow', false, 'washing'::laundry_order_status),
    ('Drying',    30, 'orange', false, 'drying'::laundry_order_status),
    ('Ready',     40, 'green',  false, 'ready'::laundry_order_status),
    ('Completed', 50, 'slate',  false, 'claimed'::laundry_order_status)
),
businesses_with_orders AS (
  SELECT DISTINCT business_id FROM public.laundry_orders
)
INSERT INTO public.order_statuses (business_id, name, sort_order, color, is_default)
SELECT bwo.business_id, ss.name, ss.sort_order, ss.color, ss.is_default
FROM businesses_with_orders bwo
CROSS JOIN status_seed ss
ON CONFLICT (business_id, name) DO NOTHING;

-- Backfill legacy laundry orders into generic orders.
WITH status_seed(name, legacy_status) AS (
  VALUES
    ('Received',  'received'::laundry_order_status),
    ('Washing',   'washing'::laundry_order_status),
    ('Drying',    'drying'::laundry_order_status),
    ('Ready',     'ready'::laundry_order_status),
    ('Completed', 'claimed'::laundry_order_status)
)
INSERT INTO public.orders (
  id,
  business_id,
  customer_id,
  customer_name,
  customer_contact,
  service_id,
  status_id,
  total_amount,
  notes,
  received_at,
  completed_at,
  created_by,
  metadata,
  created_at,
  updated_at
)
SELECT
  lo.id,
  lo.business_id,
  lo.customer_id,
  lo.customer_name,
  lo.customer_contact,
  lo.service_id,
  os.id,
  lo.total_amount,
  lo.notes,
  lo.received_at,
  lo.claimed_at,
  lo.created_by,
  jsonb_build_object(
    'legacy_source', 'laundry_orders',
    'legacy_status', lo.status,
    'weight_kg', lo.weight_kg,
    'ready_at', lo.ready_at,
    'claimed_at', lo.claimed_at
  ),
  lo.created_at,
  lo.updated_at
FROM public.laundry_orders lo
JOIN status_seed ss ON ss.legacy_status = lo.status
LEFT JOIN public.order_statuses os
  ON os.business_id = lo.business_id
 AND os.name = ss.name
ON CONFLICT (id) DO NOTHING;
