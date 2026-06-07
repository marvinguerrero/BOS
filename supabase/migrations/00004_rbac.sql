-- ============================================================================
-- Migration 00004: RBAC — viewer role, relationship type, permissions tables
-- ============================================================================

-- Add viewer to the existing user_role enum
alter type user_role add value if not exists 'viewer';

-- Relationship type: how a person relates to the business (independent of role)
do $$ begin
  create type relationship_type as enum ('employee', 'customer', 'tenant', 'supplier');
exception when duplicate_object then null;
end $$;

alter table public.business_users
  add column if not exists relationship relationship_type;

-- ─── Permission catalogue ─────────────────────────────────────────────────────

create table if not exists public.permissions (
  id          uuid primary key default uuid_generate_v4(),
  key         text not null unique,
  module_key  text not null,
  action      text not null,
  description text
);

insert into public.permissions (key, module_key, action) values
  -- inventory
  ('inventory.view',           'inventory',        'view'),
  ('inventory.create',         'inventory',        'create'),
  ('inventory.update',         'inventory',        'update'),
  ('inventory.delete',         'inventory',        'delete'),
  -- sales
  ('sales.view',               'sales',            'view'),
  ('sales.create',             'sales',            'create'),
  ('sales.update',             'sales',            'update'),
  ('sales.delete',             'sales',            'delete'),
  -- customers
  ('customers.view',           'customers',        'view'),
  ('customers.create',         'customers',        'create'),
  ('customers.update',         'customers',        'update'),
  ('customers.delete',         'customers',        'delete'),
  -- laundry orders
  ('laundry_orders.view',      'laundry_orders',   'view'),
  ('laundry_orders.create',    'laundry_orders',   'create'),
  ('laundry_orders.update',    'laundry_orders',   'update'),
  ('laundry_orders.delete',    'laundry_orders',   'delete'),
  -- laundry services
  ('laundry_services.view',    'laundry_services', 'view'),
  ('laundry_services.create',  'laundry_services', 'create'),
  ('laundry_services.update',  'laundry_services', 'update'),
  -- rooms
  ('rooms.view',               'rooms',            'view'),
  ('rooms.create',             'rooms',            'create'),
  ('rooms.update',             'rooms',            'update'),
  ('rooms.delete',             'rooms',            'delete'),
  -- tenants
  ('tenants.view',             'tenants',          'view'),
  ('tenants.create',           'tenants',          'create'),
  ('tenants.update',           'tenants',          'update'),
  -- billing
  ('billing.view',             'billing',          'view'),
  ('billing.create',           'billing',          'create'),
  ('billing.update',           'billing',          'update'),
  -- reports
  ('reports.view',             'reports',          'view'),
  -- notifications
  ('notifications.view',       'notifications',    'view'),
  -- settings
  ('settings.view',            'settings',         'view'),
  ('settings.update',          'settings',         'update')
on conflict (key) do nothing;

-- ─── Role → permission defaults ───────────────────────────────────────────────

create table if not exists public.role_permissions (
  role           text not null,
  permission_key text not null references public.permissions(key) on delete cascade,
  primary key (role, permission_key)
);

-- owner: everything
insert into public.role_permissions (role, permission_key)
select 'owner', key from public.permissions
on conflict do nothing;

-- manager: everything except destructive and settings.update
insert into public.role_permissions (role, permission_key)
select 'manager', key from public.permissions
where key not in (
  'inventory.delete', 'sales.delete', 'customers.delete',
  'rooms.delete', 'laundry_orders.delete',
  'settings.update'
)
on conflict do nothing;

-- staff: create/view on operational modules, update order status
insert into public.role_permissions (role, permission_key) values
  ('staff', 'sales.view'),
  ('staff', 'sales.create'),
  ('staff', 'customers.view'),
  ('staff', 'customers.create'),
  ('staff', 'notifications.view'),
  ('staff', 'laundry_orders.view'),
  ('staff', 'laundry_orders.create'),
  ('staff', 'laundry_orders.update'),
  ('staff', 'laundry_services.view'),
  ('staff', 'rooms.view'),
  ('staff', 'tenants.view')
on conflict do nothing;

-- viewer: read-only across core modules
insert into public.role_permissions (role, permission_key) values
  ('viewer', 'sales.view'),
  ('viewer', 'inventory.view'),
  ('viewer', 'customers.view'),
  ('viewer', 'reports.view'),
  ('viewer', 'notifications.view'),
  ('viewer', 'laundry_orders.view'),
  ('viewer', 'laundry_services.view'),
  ('viewer', 'rooms.view'),
  ('viewer', 'tenants.view'),
  ('viewer', 'billing.view')
on conflict do nothing;

-- ─── Per-member permission overrides ─────────────────────────────────────────

create table if not exists public.business_user_permissions (
  id               uuid primary key default uuid_generate_v4(),
  business_user_id uuid not null references public.business_users(id) on delete cascade,
  permission_key   text not null references public.permissions(key) on delete cascade,
  granted          boolean not null default true,
  unique (business_user_id, permission_key)
);

-- ─── RLS ──────────────────────────────────────────────────────────────────────

alter table public.permissions enable row level security;
create policy "permissions_authenticated_read"
  on public.permissions for select to authenticated
  using (true);

alter table public.role_permissions enable row level security;
create policy "role_permissions_authenticated_read"
  on public.role_permissions for select to authenticated
  using (true);

alter table public.business_user_permissions enable row level security;
create policy "business_user_permissions_member_read"
  on public.business_user_permissions for select
  using (
    exists (
      select 1 from public.business_users bu
      where bu.id = business_user_id
        and is_business_member(bu.business_id)
    )
  );
create policy "business_user_permissions_admin_write"
  on public.business_user_permissions for all
  using (
    exists (
      select 1 from public.business_users bu
      where bu.id = business_user_id
        and is_business_admin(bu.business_id)
    )
  );

-- ─── has_permission() helper ──────────────────────────────────────────────────

create or replace function has_permission(
  p_business_id  uuid,
  p_permission_key text
) returns boolean
language sql security definer stable as $$
  with member as (
    select id, role
    from public.business_users
    where business_id = p_business_id
      and user_id = auth.uid()
      and is_active = true
    limit 1
  ),
  role_grant as (
    select 1
    from public.role_permissions rp
    join member m on rp.role = m.role::text
    where rp.permission_key = p_permission_key
  ),
  override as (
    select granted
    from public.business_user_permissions bup
    join member m on bup.business_user_id = m.id
    where bup.permission_key = p_permission_key
    limit 1
  )
  select coalesce(
    (select granted from override),
    exists(select 1 from role_grant)
  );
$$;
