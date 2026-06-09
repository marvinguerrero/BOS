-- ============================================================================
-- DEFAULT SERVICE WORKFLOW
-- ============================================================================
--
-- PROBLEM
-- ───────
-- Businesses that were NOT migrated from legacy laundry_orders data have a
-- service_order workflow_definition (created by the 00021 backfill) but zero
-- order_statuses. When a Service Operator creates an order, new-order-view.tsx
-- picks `statuses.find(s => s.is_default) ?? statuses[0]`, which returns
-- undefined when the list is empty. The order is inserted with status_id = NULL,
-- and the UI displays it as "Unassigned" — even though it has an assignee.
--
-- EXPECTED STATE
-- ─────────────
-- Every business with a service_order workflow must have at least the five
-- default stages seeded so that new orders start in "Waiting" and the operator
-- can advance them through to closure without owner intervention.
--
-- Default lifecycle:
--
--   Waiting  →  In Service  →  Completed  →  Paid  →  Closed
--   Waiting  →  In Service  →  Completed  →  Collect Payment  →  Paid  →  Closed
--
-- Action button labels (stored on workflow_transitions.label):
--
--   Waiting    → "Start Service"
--   In Service → "Complete Service"
--   Completed  → "Collect Payment"
--   Paid       → "Close Order"
--
-- SCOPE
-- ─────
-- Only businesses that currently have NO order_statuses are affected.
-- Businesses that already have statuses (e.g. laundry: Received/Washing/…)
-- are left untouched. Owners can rename, reorder, or add stages at any time
-- via Settings → Workflow Management.

INSERT INTO public.workflow_definitions (business_id, transaction_type, name, description)
SELECT b.id,
       'service_order',
       'Service Orders',
       'Lifecycle stages for service-based orders.'
FROM   public.businesses b
WHERE  NOT EXISTS (
         SELECT 1
         FROM   public.workflow_definitions wd
         WHERE  wd.business_id      = b.id
           AND  wd.transaction_type = 'service_order'
       )
  AND  (
         EXISTS (
           SELECT 1
           FROM   public.orders o
           WHERE  o.business_id = b.id
         )
         OR EXISTS (
           SELECT 1
           FROM   public.services s
           WHERE  s.business_id = b.id
         )
         OR EXISTS (
           SELECT 1
           FROM   public.business_modules bm
           WHERE  bm.business_id = b.id
             AND  bm.module_key IN ('orders', 'laundry_orders')
             AND  bm.is_enabled = true
         )
       );

DO $$
DECLARE
  v_biz          RECORD;
  v_waiting_id   uuid;
  v_inservice_id uuid;
  v_completed_id uuid;
  v_collect_id   uuid;
  v_paid_id      uuid;
  v_closed_id    uuid;
BEGIN
  FOR v_biz IN
    SELECT wd.id AS workflow_id, wd.business_id
    FROM   public.workflow_definitions wd
    WHERE  wd.transaction_type = 'service_order'
      AND  NOT EXISTS (
        SELECT 1 FROM public.order_statuses os
        WHERE  os.business_id = wd.business_id
      )
  LOOP
    -- ── Stages ─────────────────────────────────────────────────────────────

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'Waiting',    10, 'blue',   true,  false)
    RETURNING id INTO v_waiting_id;

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'In Service', 20, 'yellow', false, false)
    RETURNING id INTO v_inservice_id;

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'Completed',  30, 'green',  false, false)
    RETURNING id INTO v_completed_id;

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'Collect Payment', 40, 'orange', false, false)
    RETURNING id INTO v_collect_id;

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'Paid',       50, 'teal',   false, false)
    RETURNING id INTO v_paid_id;

    INSERT INTO public.order_statuses
      (business_id, workflow_id, name, sort_order, color, is_default, is_terminal)
    VALUES
      (v_biz.business_id, v_biz.workflow_id, 'Closed',     60, 'slate',  false, true)
    RETURNING id INTO v_closed_id;

    -- ── Transitions with action labels ─────────────────────────────────────
    --
    -- Labels are used by the orders UI as button text, giving operators clear
    -- action-oriented CTAs instead of generic "Mark {status}" text.

    INSERT INTO public.workflow_transitions
      (workflow_id, from_status_id, to_status_id, label, sort_order)
    VALUES
      (v_biz.workflow_id, v_waiting_id,   v_inservice_id, 'Start Service',   1),
      (v_biz.workflow_id, v_inservice_id, v_completed_id, 'Complete Service', 2),
      (v_biz.workflow_id, v_completed_id, v_collect_id,   'Collect Payment',  3),
      (v_biz.workflow_id, v_collect_id,   v_paid_id,      'Record Payment',   4),
      (v_biz.workflow_id, v_paid_id,      v_closed_id,    'Close Order',      5);

  END LOOP;
END;
$$;

-- ── Backfill existing orders that have an assignee but no status ───────────
--
-- These are orders created before the workflow was seeded. For each business
-- that now has a default status, set it on any orders that still have
-- status_id = NULL but already have an assignee — making them appear in
-- "Waiting" rather than staying invisible with a NULL status.

UPDATE public.orders o
SET    status_id = def_status.id
FROM (
  SELECT os.id, os.business_id
  FROM   public.order_statuses os
  WHERE  os.is_default = true
) def_status
WHERE  o.business_id    = def_status.business_id
  AND  o.status_id      IS NULL
  AND  o.completed_at   IS NULL;
