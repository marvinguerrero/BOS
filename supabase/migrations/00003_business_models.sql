-- ============================================================================
-- Migration 00003: Business Models (multi-select, replaces single template_key)
-- ============================================================================

-- Business model catalogue
create table if not exists public.business_models (
  id          uuid primary key default uuid_generate_v4(),
  key         text not null unique,
  name        text not null,
  description text,
  icon        text,
  is_active   boolean not null default true
);

insert into public.business_models (key, name, description, icon) values
  ('retail',  'Retail',   'Sell physical products with inventory tracking.',  'Store'),
  ('service', 'Service',  'Manage service orders and appointments.',          'WashingMachine'),
  ('rental',  'Rental',   'Track rentable assets, tenants, and billing.',     'Home')
on conflict (key) do nothing;

-- Many-to-many: a business can have multiple models
create table if not exists public.business_business_models (
  business_id uuid not null references public.businesses(id) on delete cascade,
  model_key   text not null references public.business_models(key) on delete cascade,
  primary key (business_id, model_key)
);

-- Backfill from existing template_key values
insert into public.business_business_models (business_id, model_key)
select
  id,
  case template_key
    when 'sari_sari'   then 'retail'
    when 'laundry'     then 'service'
    when 'room_rental' then 'rental'
  end
from public.businesses
where template_key is not null
on conflict do nothing;

-- Extra columns on businesses for richer metadata
alter table public.businesses
  add column if not exists description   text,
  add column if not exists currency      text not null default 'PHP',
  add column if not exists timezone      text not null default 'Asia/Manila';

-- RLS
alter table public.business_models enable row level security;

create policy "business_models_public_read"
  on public.business_models for select
  using (true);

alter table public.business_business_models enable row level security;

create policy "business_business_models_member_read"
  on public.business_business_models for select
  using (is_business_member(business_id));

create policy "business_business_models_admin_write"
  on public.business_business_models for all
  using (is_business_admin(business_id));

-- Allow creator to bootstrap their model associations before owner row exists
create policy "business_business_models_creator_bootstrap"
  on public.business_business_models for insert
  with check (
    exists (
      select 1 from public.businesses b
      where b.id = business_id
        and b.created_by = auth.uid()
    )
  );
