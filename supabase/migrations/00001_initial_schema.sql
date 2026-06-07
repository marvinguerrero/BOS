-- ============================================================================
-- BOS (Business Operating System) - Initial Schema
-- Migration: 00001_initial_schema.sql
-- ============================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";  -- for full-text search

-- ============================================================================
-- ENUMS
-- ============================================================================

create type user_role as enum ('owner', 'manager', 'staff');
create type business_template_key as enum ('sari_sari', 'laundry', 'room_rental');
create type module_key as enum (
  'inventory', 'sales', 'customers',
  'laundry_services', 'laundry_orders',
  'rooms', 'tenants', 'billing',
  'reports', 'notifications'
);
create type audit_action as enum ('create', 'update', 'delete', 'restore');
create type payment_method as enum ('cash', 'gcash', 'maya', 'credit');
create type laundry_order_status as enum ('received', 'washing', 'drying', 'ready', 'claimed');
create type room_status as enum ('available', 'occupied', 'maintenance');
create type bill_status as enum ('pending', 'paid', 'overdue', 'partial');
create type notification_status as enum ('unread', 'read');
create type inventory_movement_type as enum ('in', 'out', 'adjustment');
create type ledger_type as enum ('debit', 'credit');
create type pricing_type as enum ('fixed', 'per_kg');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- User profiles (extends Supabase auth.users)
create table public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  mobile_number text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Templates (database-driven, not hardcoded)
create table public.templates (
  id          uuid primary key default uuid_generate_v4(),
  key         business_template_key not null unique,
  name        text not null,
  description text,
  icon        text,
  config      jsonb not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- Businesses (multi-tenant root)
create table public.businesses (
  id             uuid primary key default uuid_generate_v4(),
  name           text not null,
  template_key   business_template_key not null,
  address        text,
  contact_number text,
  logo_url       text,
  is_active      boolean not null default true,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

-- Business <-> User membership with roles
create table public.business_users (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        user_role not null default 'staff',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, user_id)
);

-- Enabled modules per business
create table public.business_modules (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  module_key  module_key not null,
  is_enabled  boolean not null default true,
  config      jsonb not null default '{}',
  created_at  timestamptz not null default now(),
  unique (business_id, module_key)
);

-- Notifications
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  type        text not null,
  title       text not null,
  message     text not null,
  status      notification_status not null default 'unread',
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

-- Audit log (immutable history)
create table public.audit_logs (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  action      audit_action not null,
  table_name  text not null,
  record_id   uuid not null,
  old_data    jsonb,
  new_data    jsonb,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- SARI-SARI STORE TABLES
-- ============================================================================

create table public.categories (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (business_id, name)
);

create table public.products (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  category_id         uuid references public.categories(id) on delete set null,
  name                text not null,
  sku                 text,
  cost_price          numeric(12,2) not null default 0,
  selling_price       numeric(12,2) not null default 0,
  stock_quantity      integer not null default 0,
  low_stock_threshold integer not null default 5,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (business_id, sku)
);

create table public.customers (
  id                  uuid primary key default uuid_generate_v4(),
  business_id         uuid not null references public.businesses(id) on delete cascade,
  name                text not null,
  contact_number      text,
  outstanding_balance numeric(12,2) not null default 0,
  is_active           boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table public.sales (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references public.businesses(id) on delete cascade,
  customer_id     uuid references public.customers(id) on delete set null,
  cashier_id      uuid not null references auth.users(id),
  subtotal        numeric(12,2) not null default 0,
  discount        numeric(12,2) not null default 0,
  total           numeric(12,2) not null default 0,
  payment_method  payment_method not null default 'cash',
  amount_tendered numeric(12,2) not null default 0,
  change_amount   numeric(12,2) not null default 0,
  notes           text,
  created_at      timestamptz not null default now()
);

create table public.sale_items (
  id          uuid primary key default uuid_generate_v4(),
  sale_id     uuid not null references public.sales(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete restrict,
  quantity    integer not null,
  unit_price  numeric(12,2) not null,
  total_price numeric(12,2) not null
);

create table public.customer_ledger (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  sale_id     uuid references public.sales(id) on delete set null,
  type        ledger_type not null,
  amount      numeric(12,2) not null,
  notes       text,
  created_at  timestamptz not null default now()
);

create table public.inventory_movements (
  id          uuid primary key default uuid_generate_v4(),
  business_id uuid not null references public.businesses(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  type        inventory_movement_type not null,
  quantity    integer not null,
  reference_id uuid,
  notes       text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- LAUNDRY SHOP TABLES
-- ============================================================================

create table public.laundry_services (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  name         text not null,
  pricing_type pricing_type not null default 'fixed',
  price        numeric(12,2) not null default 0,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.laundry_orders (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  customer_name    text not null,
  customer_contact text,
  service_id       uuid not null references public.laundry_services(id) on delete restrict,
  weight_kg        numeric(8,2),
  total_amount     numeric(12,2) not null default 0,
  status           laundry_order_status not null default 'received',
  notes            text,
  received_at      timestamptz not null default now(),
  ready_at         timestamptz,
  claimed_at       timestamptz,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ============================================================================
-- ROOM RENTAL TABLES
-- ============================================================================

create table public.rooms (
  id           uuid primary key default uuid_generate_v4(),
  business_id  uuid not null references public.businesses(id) on delete cascade,
  room_number  text not null,
  floor        text,
  type         text,
  monthly_rate numeric(12,2) not null default 0,
  status       room_status not null default 'available',
  amenities    text[] not null default '{}',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (business_id, room_number)
);

create table public.tenants (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  room_id        uuid references public.rooms(id) on delete set null,
  name           text not null,
  contact_number text,
  email          text,
  id_type        text,
  id_number      text,
  start_date     date not null,
  end_date       date,
  monthly_rate   numeric(12,2) not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.rent_bills (
  id             uuid primary key default uuid_generate_v4(),
  business_id    uuid not null references public.businesses(id) on delete cascade,
  tenant_id      uuid not null references public.tenants(id) on delete cascade,
  room_id        uuid not null references public.rooms(id) on delete restrict,
  billing_period text not null,  -- e.g. "2025-01"
  due_date       date not null,
  amount         numeric(12,2) not null,
  paid_amount    numeric(12,2) not null default 0,
  status         bill_status not null default 'pending',
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table public.rent_payments (
  id               uuid primary key default uuid_generate_v4(),
  business_id      uuid not null references public.businesses(id) on delete cascade,
  bill_id          uuid not null references public.rent_bills(id) on delete cascade,
  amount           numeric(12,2) not null,
  payment_method   payment_method not null default 'cash',
  reference_number text,
  notes            text,
  created_by       uuid not null references auth.users(id),
  created_at       timestamptz not null default now()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- business_users
create index idx_business_users_user_id on public.business_users(user_id);
create index idx_business_users_business_id on public.business_users(business_id);

-- products
create index idx_products_business_id on public.products(business_id);
create index idx_products_category_id on public.products(category_id);
create index idx_products_name_trgm on public.products using gin(name gin_trgm_ops);
create index idx_products_low_stock on public.products(business_id) where stock_quantity <= low_stock_threshold and is_active = true;

-- sales
create index idx_sales_business_id on public.sales(business_id);
create index idx_sales_created_at on public.sales(business_id, created_at desc);
create index idx_sales_customer_id on public.sales(customer_id);

-- sale_items
create index idx_sale_items_sale_id on public.sale_items(sale_id);
create index idx_sale_items_product_id on public.sale_items(product_id);

-- customers
create index idx_customers_business_id on public.customers(business_id);
create index idx_customers_name_trgm on public.customers using gin(name gin_trgm_ops);

-- laundry orders
create index idx_laundry_orders_business_id on public.laundry_orders(business_id);
create index idx_laundry_orders_status on public.laundry_orders(business_id, status);
create index idx_laundry_orders_created_at on public.laundry_orders(business_id, created_at desc);

-- rooms
create index idx_rooms_business_id on public.rooms(business_id);
create index idx_rooms_status on public.rooms(business_id, status);

-- tenants
create index idx_tenants_business_id on public.tenants(business_id);
create index idx_tenants_room_id on public.tenants(room_id);

-- rent_bills
create index idx_rent_bills_business_id on public.rent_bills(business_id);
create index idx_rent_bills_tenant_id on public.rent_bills(tenant_id);
create index idx_rent_bills_due_date on public.rent_bills(business_id, due_date);
create index idx_rent_bills_status on public.rent_bills(business_id, status);

-- audit logs
create index idx_audit_logs_business_id on public.audit_logs(business_id);
create index idx_audit_logs_record on public.audit_logs(table_name, record_id);
create index idx_audit_logs_user_id on public.audit_logs(user_id);

-- notifications
create index idx_notifications_business_id on public.notifications(business_id);
create index idx_notifications_user_id on public.notifications(user_id, status);

-- inventory movements
create index idx_inventory_movements_product_id on public.inventory_movements(product_id);
create index idx_inventory_movements_business_id on public.inventory_movements(business_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================

create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_updated_at before update on public.businesses
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.products
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.customers
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.laundry_orders
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.rooms
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.tenants
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.rent_bills
  for each row execute function public.handle_updated_at();
create trigger set_updated_at before update on public.user_profiles
  for each row execute function public.handle_updated_at();

-- ============================================================================
-- AUTH TRIGGER: auto-create user profile on signup
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.user_profiles enable row level security;
alter table public.businesses enable row level security;
alter table public.business_users enable row level security;
alter table public.business_modules enable row level security;
alter table public.templates enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.customers enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.customer_ledger enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.laundry_services enable row level security;
alter table public.laundry_orders enable row level security;
alter table public.rooms enable row level security;
alter table public.tenants enable row level security;
alter table public.rent_bills enable row level security;
alter table public.rent_payments enable row level security;

-- Helper: check if current user belongs to a business
create or replace function public.is_business_member(p_business_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.business_users
    where business_id = p_business_id
      and user_id = auth.uid()
      and is_active = true
  );
$$;

-- Helper: get user's role in a business
create or replace function public.get_business_role(p_business_id uuid)
returns user_role language sql security definer stable as $$
  select role from public.business_users
  where business_id = p_business_id
    and user_id = auth.uid()
    and is_active = true
  limit 1;
$$;

-- Helper: check if user is owner or manager
create or replace function public.is_business_admin(p_business_id uuid)
returns boolean language sql security definer stable as $$
  select exists (
    select 1 from public.business_users
    where business_id = p_business_id
      and user_id = auth.uid()
      and role in ('owner', 'manager')
      and is_active = true
  );
$$;

-- user_profiles: users can only see/edit their own profile
create policy "users_own_profile" on public.user_profiles
  for all using (id = auth.uid());

-- templates: public read
create policy "templates_public_read" on public.templates
  for select using (true);

-- businesses: members can see their businesses
create policy "businesses_member_read" on public.businesses
  for select using (public.is_business_member(id));

create policy "businesses_owner_write" on public.businesses
  for update using (public.get_business_role(id) = 'owner');

create policy "businesses_create" on public.businesses
  for insert with check (auth.uid() = created_by);

-- business_users: members can see memberships for their businesses
create policy "business_users_member_read" on public.business_users
  for select using (public.is_business_member(business_id));

create policy "business_users_admin_write" on public.business_users
  for all using (public.is_business_admin(business_id));

-- business_modules: members can read; admins can write
create policy "business_modules_member_read" on public.business_modules
  for select using (public.is_business_member(business_id));

create policy "business_modules_admin_write" on public.business_modules
  for all using (public.is_business_admin(business_id));

-- Macro: generate standard member/admin policies for a table with business_id
-- (applied manually below for each table)

-- notifications
create policy "notifications_member_read" on public.notifications
  for select using (public.is_business_member(business_id));
create policy "notifications_member_write" on public.notifications
  for all using (public.is_business_member(business_id));

-- audit_logs: read-only for admins
create policy "audit_logs_admin_read" on public.audit_logs
  for select using (public.is_business_admin(business_id));
create policy "audit_logs_insert" on public.audit_logs
  for insert with check (public.is_business_member(business_id));

-- categories
create policy "categories_member_read" on public.categories
  for select using (public.is_business_member(business_id));
create policy "categories_admin_write" on public.categories
  for all using (public.is_business_admin(business_id));

-- products
create policy "products_member_read" on public.products
  for select using (public.is_business_member(business_id));
create policy "products_admin_write" on public.products
  for all using (public.is_business_admin(business_id));

-- customers
create policy "customers_member_read" on public.customers
  for select using (public.is_business_member(business_id));
create policy "customers_member_write" on public.customers
  for all using (public.is_business_member(business_id));

-- sales
create policy "sales_member_read" on public.sales
  for select using (public.is_business_member(business_id));
create policy "sales_member_insert" on public.sales
  for insert with check (public.is_business_member(business_id));

-- sale_items (join via sales)
create policy "sale_items_member_read" on public.sale_items
  for select using (
    exists (select 1 from public.sales s where s.id = sale_id and public.is_business_member(s.business_id))
  );
create policy "sale_items_member_insert" on public.sale_items
  for insert with check (
    exists (select 1 from public.sales s where s.id = sale_id and public.is_business_member(s.business_id))
  );

-- customer_ledger
create policy "customer_ledger_member_read" on public.customer_ledger
  for select using (public.is_business_member(business_id));
create policy "customer_ledger_member_write" on public.customer_ledger
  for all using (public.is_business_member(business_id));

-- inventory_movements
create policy "inventory_movements_member_read" on public.inventory_movements
  for select using (public.is_business_member(business_id));
create policy "inventory_movements_member_write" on public.inventory_movements
  for all using (public.is_business_member(business_id));

-- laundry_services
create policy "laundry_services_member_read" on public.laundry_services
  for select using (public.is_business_member(business_id));
create policy "laundry_services_admin_write" on public.laundry_services
  for all using (public.is_business_admin(business_id));

-- laundry_orders
create policy "laundry_orders_member_read" on public.laundry_orders
  for select using (public.is_business_member(business_id));
create policy "laundry_orders_member_write" on public.laundry_orders
  for all using (public.is_business_member(business_id));

-- rooms
create policy "rooms_member_read" on public.rooms
  for select using (public.is_business_member(business_id));
create policy "rooms_admin_write" on public.rooms
  for all using (public.is_business_admin(business_id));

-- tenants
create policy "tenants_member_read" on public.tenants
  for select using (public.is_business_member(business_id));
create policy "tenants_member_write" on public.tenants
  for all using (public.is_business_member(business_id));

-- rent_bills
create policy "rent_bills_member_read" on public.rent_bills
  for select using (public.is_business_member(business_id));
create policy "rent_bills_admin_write" on public.rent_bills
  for all using (public.is_business_admin(business_id));

-- rent_payments
create policy "rent_payments_member_read" on public.rent_payments
  for select using (public.is_business_member(business_id));
create policy "rent_payments_member_write" on public.rent_payments
  for all using (public.is_business_member(business_id));
