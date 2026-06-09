-- ============================================================================
-- WORKFLOW ENGINE
-- ============================================================================
--
-- Introduces a configurable state-machine layer on top of order_statuses.
-- Every transaction type (service_order, sale, rental, task) can have its
-- own workflow definition with an ordered set of statuses and an explicit
-- graph of allowed transitions.
--
-- When no transitions are configured for a workflow, the system falls back
-- to the previous sort_order-based linear advance — fully backward compatible.
--
-- Tables:
--   workflow_definitions   — one per (business, transaction_type)
--   workflow_transitions   — allowed from_status → to_status edges
--
-- Columns added to order_statuses:
--   workflow_id   — FK to the workflow this status belongs to
--   is_terminal   — marks a status as a terminal/final state

-- ── 1. workflow_definitions ────────────────────────────────────────────────

CREATE TABLE public.workflow_definitions (
  id               uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id      uuid        NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  transaction_type text        NOT NULL,
  name             text        NOT NULL,
  description      text,
  is_active        boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, transaction_type),
  CONSTRAINT workflow_transaction_type_check
    CHECK (transaction_type IN ('service_order', 'sale', 'rental', 'task'))
);

DROP TRIGGER IF EXISTS set_updated_at ON public.workflow_definitions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.workflow_definitions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_workflow_defs_business
  ON public.workflow_definitions (business_id);

-- ── 2. Extend order_statuses ───────────────────────────────────────────────

ALTER TABLE public.order_statuses
  ADD COLUMN IF NOT EXISTS workflow_id  uuid    REFERENCES public.workflow_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_terminal  boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_order_statuses_workflow
  ON public.order_statuses (workflow_id);

-- ── 3. workflow_transitions ────────────────────────────────────────────────
--
-- from_status_id NULL means the transition is valid from ANY status
-- (useful for "Cancel" or "Reopen" type transitions).

CREATE TABLE public.workflow_transitions (
  id             uuid        PRIMARY KEY DEFAULT uuid_generate_v4(),
  workflow_id    uuid        NOT NULL REFERENCES public.workflow_definitions(id) ON DELETE CASCADE,
  from_status_id uuid        REFERENCES public.order_statuses(id) ON DELETE CASCADE,
  to_status_id   uuid        NOT NULL   REFERENCES public.order_statuses(id) ON DELETE CASCADE,
  label          text,
  sort_order     integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, from_status_id, to_status_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_transitions_workflow
  ON public.workflow_transitions (workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_transitions_from
  ON public.workflow_transitions (from_status_id);

-- ── 4. RLS ─────────────────────────────────────────────────────────────────

ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_transitions  ENABLE ROW LEVEL SECURITY;

-- Members can read workflow definitions for their business.
CREATE POLICY "workflow_defs_member_read" ON public.workflow_definitions
  FOR SELECT USING (public.is_business_member(business_id));

-- Owners and managers can write (create/update/delete) workflow definitions.
CREATE POLICY "workflow_defs_admin_write" ON public.workflow_definitions
  FOR ALL USING (public.is_business_admin(business_id));

-- Members can read transitions belonging to their business's workflows.
CREATE POLICY "workflow_trans_member_read" ON public.workflow_transitions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.workflow_definitions wd
      WHERE wd.id = workflow_id
        AND public.is_business_member(wd.business_id)
    )
  );

-- Owners and managers can write transitions.
CREATE POLICY "workflow_trans_admin_write" ON public.workflow_transitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.workflow_definitions wd
      WHERE wd.id = workflow_id
        AND public.is_business_admin(wd.business_id)
    )
  );

-- ── 5. Bootstrap policy for workflow_definitions ───────────────────────────
--
-- The onboarding flow creates statuses before the owner membership row exists.
-- This mirrors the pattern used for services and order_statuses in 00010.

CREATE POLICY "workflow_defs_creator_bootstrap" ON public.workflow_definitions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id = business_id
        AND b.created_by = auth.uid()
    )
  );

-- ── 6. Backfill: create workflow_definitions for existing businesses ────────

INSERT INTO public.workflow_definitions (business_id, transaction_type, name, description)
SELECT DISTINCT
  os.business_id,
  'service_order',
  'Service Orders',
  'Lifecycle stages for service-based orders.'
FROM public.order_statuses os
WHERE NOT EXISTS (
  SELECT 1 FROM public.workflow_definitions wd
  WHERE wd.business_id = os.business_id
    AND wd.transaction_type = 'service_order'
);

-- ── 7. Link existing order_statuses to their workflow_definition ───────────

UPDATE public.order_statuses os
SET    workflow_id = wd.id
FROM   public.workflow_definitions wd
WHERE  wd.business_id      = os.business_id
  AND  wd.transaction_type = 'service_order'
  AND  os.workflow_id      IS NULL;

-- ── 8. Mark terminal statuses ──────────────────────────────────────────────
--
-- A status is terminal when no other active status in the same business has
-- a higher sort_order — i.e., it is currently the last step in the sequence.
-- Owners can change this later via the workflow management UI.

UPDATE public.order_statuses os
SET    is_terminal = true
WHERE  NOT EXISTS (
  SELECT 1 FROM public.order_statuses next_os
  WHERE  next_os.business_id = os.business_id
    AND  next_os.sort_order  > os.sort_order
);
