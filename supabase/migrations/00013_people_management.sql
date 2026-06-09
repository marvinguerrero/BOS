-- ============================================================================
-- PEOPLE MANAGEMENT: positions, relationships, and service assignments
-- ============================================================================
--
-- Authentication stays in Supabase auth.users. business_users remains the
-- access/membership table. business_people stores business relationships that
-- may or may not have BOS login access yet.

CREATE TABLE IF NOT EXISTS public.positions (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name        text NOT NULL,
  description text,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, name)
);

DROP TRIGGER IF EXISTS set_updated_at ON public.positions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.positions
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS relationship_type text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.business_users
SET relationship_type = CASE
  WHEN role = 'owner' THEN 'owner'
  WHEN relationship::text = 'supplier' THEN 'supplier_contact'
  WHEN relationship IS NOT NULL THEN relationship::text
  ELSE 'employee'
END
WHERE relationship_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_users_relationship_type_check'
      AND conrelid = 'public.business_users'::regclass
  ) THEN
    ALTER TABLE public.business_users
      ADD CONSTRAINT business_users_relationship_type_check
      CHECK (relationship_type IN ('owner', 'employee', 'customer', 'tenant', 'supplier_contact'));
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.business_users;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.business_users
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.business_people (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  business_user_id     uuid REFERENCES public.business_users(id) ON DELETE SET NULL,
  name                 text NOT NULL,
  email                text,
  mobile_number        text,
  relationship_type    text NOT NULL DEFAULT 'employee',
  role                 user_role,
  position_id          uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  is_active            boolean NOT NULL DEFAULT true,
  invite_status        text NOT NULL DEFAULT 'none',
  scheduling_settings  jsonb NOT NULL DEFAULT '{}',
  payroll_settings     jsonb NOT NULL DEFAULT '{}',
  metadata             jsonb NOT NULL DEFAULT '{}',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_people_relationship_type_check'
      AND conrelid = 'public.business_people'::regclass
  ) THEN
    ALTER TABLE public.business_people
      ADD CONSTRAINT business_people_relationship_type_check
      CHECK (relationship_type IN ('owner', 'employee', 'customer', 'tenant', 'supplier_contact'));
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'business_people_invite_status_check'
      AND conrelid = 'public.business_people'::regclass
  ) THEN
    ALTER TABLE public.business_people
      ADD CONSTRAINT business_people_invite_status_check
      CHECK (invite_status IN ('none', 'pending', 'accepted', 'revoked'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_people_business_user
  ON public.business_people (business_id, business_user_id)
  WHERE business_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_business_people_business_active
  ON public.business_people (business_id, is_active);

CREATE INDEX IF NOT EXISTS idx_business_people_position
  ON public.business_people (position_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.business_people;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.business_people
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.business_people (
  business_id,
  user_id,
  business_user_id,
  name,
  mobile_number,
  relationship_type,
  role,
  position_id,
  is_active,
  invite_status,
  metadata,
  created_at
)
SELECT
  bu.business_id,
  bu.user_id,
  bu.id,
  COALESCE(NULLIF(up.full_name, ''), 'Team Member'),
  up.mobile_number,
  bu.relationship_type,
  bu.role,
  bu.position_id,
  bu.is_active,
  'accepted',
  jsonb_build_object('legacy_source', 'business_users'),
  bu.created_at
FROM public.business_users bu
LEFT JOIN public.user_profiles up ON up.id = bu.user_id
ON CONFLICT (business_id, business_user_id) WHERE business_user_id IS NOT NULL
DO UPDATE SET
  user_id = excluded.user_id,
  name = excluded.name,
  mobile_number = excluded.mobile_number,
  relationship_type = excluded.relationship_type,
  role = excluded.role,
  position_id = excluded.position_id,
  is_active = excluded.is_active,
  updated_at = now();

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS assigned_to_person_id uuid REFERENCES public.business_people(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_position_id uuid REFERENCES public.positions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_assigned_person
  ON public.orders (business_id, assigned_to_person_id);

ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_people ENABLE ROW LEVEL SECURITY;

CREATE POLICY "positions_member_read" ON public.positions
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "positions_admin_write" ON public.positions
  FOR ALL USING (public.is_business_admin(business_id));

CREATE POLICY "business_people_member_read" ON public.business_people
  FOR SELECT USING (public.is_business_member(business_id));
CREATE POLICY "business_people_admin_write" ON public.business_people
  FOR ALL USING (public.is_business_admin(business_id));

INSERT INTO public.permissions (key, module_key, action) VALUES
  ('people.view',      'people', 'view'),
  ('people.create',    'people', 'create'),
  ('people.update',    'people', 'update'),
  ('people.delete',    'people', 'delete'),
  ('positions.view',   'people', 'view'),
  ('positions.create', 'people', 'create'),
  ('positions.update', 'people', 'update'),
  ('positions.delete', 'people', 'delete')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'owner', key
FROM public.permissions
WHERE module_key = 'people'
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key) VALUES
  ('manager', 'people.view'),
  ('manager', 'positions.view'),
  ('manager', 'people.update'),
  ('staff',   'people.view'),
  ('viewer',  'people.view'),
  ('viewer',  'positions.view')
ON CONFLICT DO NOTHING;
