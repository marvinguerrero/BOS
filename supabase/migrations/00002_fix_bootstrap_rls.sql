-- ============================================================================
-- Migration 00002: Fix bootstrap RLS for business_users and business_modules
-- ============================================================================
--
-- Problem: business_users_admin_write and business_modules_admin_write both use
--   FOR ALL USING (is_business_admin(business_id))
-- which calls is_business_admin() → queries business_users → finds zero rows →
-- returns false → INSERT blocked with 403.
--
-- Fix: Add additive INSERT-only policies that let the business creator bootstrap
-- their first membership record and initial modules. PostgreSQL ORs permissive
-- policies of the same command, so these allow INSERT when the creator check
-- passes even though the admin check fails.
-- ============================================================================

-- Allow business creator to read their own business before any business_users row exists.
-- Without this, the exists() subquery in the bootstrap policies below runs through
-- the businesses_member_read policy (which checks business_users → empty → false),
-- causing the bootstrap INSERT checks to return false even with valid data.
create policy "businesses_creator_read" on public.businesses
  for select using (auth.uid() = created_by);

-- Allow the business creator to insert themselves as the first member (owner).
-- Condition: the user is inserting a record for themselves on a business they created.
create policy "business_users_creator_bootstrap" on public.business_users
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.created_by = auth.uid()
    )
  );

-- Allow the business creator to provision initial modules.
-- Condition: the business being provisioned was created by the current user.
create policy "business_modules_creator_bootstrap" on public.business_modules
  for insert with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.created_by = auth.uid()
    )
  );
