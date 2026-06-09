-- ============================================================================
-- FIX SALE TRIGGER SECURITY DEFINER
-- ============================================================================
--
-- ROOT CAUSE
-- ──────────
-- Two trigger functions in migration 00008 are missing SECURITY DEFINER:
--
--   1. create_account_transaction_for_sale()
--      Fires AFTER INSERT on sales. INSERTs into account_transactions.
--      account_transactions has RLS enabled with NO INSERT policy
--      (comment in 00008: "all writes go through SECURITY DEFINER functions").
--      Without SECURITY DEFINER, this INSERT runs as the authenticated user
--      and is denied by RLS → trigger fails → sale INSERT rolls back → 403.
--
--   2. update_account_cached_balance()
--      Fires AFTER INSERT on account_transactions. UPDATEs cached_balance
--      on financial_accounts. The owners_manage_accounts policy only allows
--      owners to UPDATE financial_accounts. Without SECURITY DEFINER, this
--      fails for any non-owner who creates a sale → cascades from fix #1.
--
-- EFFECT
-- ──────
-- Any authenticated user whose sale triggers payment_account_id IS NOT NULL
-- gets a 403 on POST /rest/v1/sales?select=* regardless of their profile or role.
--
-- The owner bypass in effective_scope() is BOS-level logic. The trigger runs
-- in the PostgreSQL session as the `authenticated` role and is subject to RLS
-- regardless of BOS role.
--
-- FIX
-- ───
-- Recreate both functions with SECURITY DEFINER and SET search_path = public.

CREATE OR REPLACE FUNCTION public.update_account_cached_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.financial_accounts
  SET cached_balance = cached_balance + NEW.amount
  WHERE id = NEW.account_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_account_transaction_for_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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

NOTIFY pgrst, 'reload schema';
