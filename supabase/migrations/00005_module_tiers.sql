-- ============================================================================
-- Migration 00005: Module tiers and per-module settings
-- ============================================================================

alter table public.business_modules
  add column if not exists tier     smallint not null default 2,
  add column if not exists settings jsonb    not null default '{}';

-- Tier 1: always-on essential modules
update public.business_modules
set tier = 1
where module_key in ('notifications', 'reports');

-- Tier 2: operational modules (default, already set via column default)
-- No update needed — all others stay at 2.
