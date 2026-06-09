-- ============================================================================
-- SERVICE OPERATOR WORKFLOW FIX
-- ============================================================================
--
-- ROOT CAUSE
-- ──────────
-- Two RLS policies introduced in migration 00019 check:
--
--   WHEN 'assigned' THEN
--     assigned_to_person_id = public.get_user_person_id(business_id)
--
-- In SQL, NULL = <anything> evaluates to NULL — never TRUE. RLS treats NULL
-- as FALSE, so the row is rejected. This means a Service Operator loses all
-- read/write access to their own orders whenever either side is NULL:
--
--   • get_user_person_id() returns NULL when the operator has no linked
--     business_people record (e.g. the people record was created without
--     completing invitation flow, so user_id is NULL).
--
--   • assigned_to_person_id is NULL when the assignment trigger
--     (enforce_order_assignment from 00018) could not find the operator's
--     business_people record, leaving the column at its submitted value (NULL).
--
-- EFFECT
-- ──────
-- Service Operators can CREATE orders (orders.create uses own → created_by,
-- which is NOT NULL and always matches) but cannot VIEW or UPDATE them because
-- the assigned scope check silently evaluates to NULL → FALSE.
--
-- FIX
-- ───
-- Extend the 'assigned' branch to include a fallback:
--
--   assigned_to_person_id = get_user_person_id(business_id)
--   OR created_by = auth.uid()
--
-- created_by is declared NOT NULL REFERENCES auth.users(id), so
-- created_by = auth.uid() never produces a NULL comparison.
--
-- Why this is safe:
--   • Operators who lack orders.assign are forced by the trigger to always
--     appear as both created_by AND assigned_to_person_id on their orders.
--     The fallback is therefore semantically equivalent for self-created orders.
--   • Manager-created orders assigned to an operator still satisfy the first
--     branch (get_user_person_id returns the operator's business_people.id).
--   • The fallback does NOT grant operators access to orders they created
--     but that were reassigned away — such reassignment requires orders.assign,
--     which Service Operators do not have. The trigger would have rejected it.
--
-- Tables affected: orders (SELECT, UPDATE policies only)
-- Tables NOT changed: sales, sale_items (different column; no analogous bug)

-- ── 1. orders_scope_read ───────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders_scope_read" ON public.orders;

CREATE POLICY "orders_scope_read" ON public.orders
  FOR SELECT
  USING (
    CASE public.effective_scope(business_id, 'orders.view')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN
        assigned_to_person_id = public.get_user_person_id(business_id)
        OR created_by = auth.uid()
      WHEN 'own'        THEN
        created_by = auth.uid()
      ELSE false
    END
  );

-- ── 2. orders_scope_update ─────────────────────────────────────────────────

DROP POLICY IF EXISTS "orders_scope_update" ON public.orders;

CREATE POLICY "orders_scope_update" ON public.orders
  FOR UPDATE
  USING (
    CASE public.effective_scope(business_id, 'orders.update')
      WHEN 'all'        THEN true
      WHEN 'department' THEN true
      WHEN 'assigned'   THEN
        assigned_to_person_id = public.get_user_person_id(business_id)
        OR created_by = auth.uid()
      WHEN 'own'        THEN
        created_by = auth.uid()
      ELSE false
    END
  );

-- No WITH CHECK clause needed: status updates do not change assigned_to_person_id
-- or created_by, so the pre-update predicate remains true on the post-update row.
