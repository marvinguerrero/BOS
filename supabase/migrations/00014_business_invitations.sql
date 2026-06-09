-- ============================================================================
-- USER INVITATIONS: business invitations and membership acceptance workflow
-- ============================================================================
--
-- Auth remains unchanged. Invitations are business-scoped records that become
-- business_users memberships only after the invited user accepts.

CREATE TABLE IF NOT EXISTS public.business_invitations (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  business_id          uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email                text NOT NULL,
  relationship_type    text NOT NULL DEFAULT 'employee',
  role                 user_role NOT NULL DEFAULT 'staff',
  position_id          uuid REFERENCES public.positions(id) ON DELETE SET NULL,
  status               text NOT NULL DEFAULT 'pending',
  expires_at           timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_by           uuid NOT NULL REFERENCES auth.users(id),
  accepted_by          uuid REFERENCES auth.users(id),
  accepted_at          timestamptz,
  declined_at          timestamptz,
  email_sent_at        timestamptz,
  email_delivery_status text NOT NULL DEFAULT 'queued',
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_invitations_relationship_type_check'
      AND conrelid = 'public.business_invitations'::regclass
  ) THEN
    ALTER TABLE public.business_invitations
      ADD CONSTRAINT business_invitations_relationship_type_check
      CHECK (relationship_type IN ('owner', 'employee', 'customer', 'tenant', 'supplier_contact'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_invitations_status_check'
      AND conrelid = 'public.business_invitations'::regclass
  ) THEN
    ALTER TABLE public.business_invitations
      ADD CONSTRAINT business_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_invitations_email_delivery_status_check'
      AND conrelid = 'public.business_invitations'::regclass
  ) THEN
    ALTER TABLE public.business_invitations
      ADD CONSTRAINT business_invitations_email_delivery_status_check
      CHECK (email_delivery_status IN ('queued', 'sent', 'failed', 'not_configured'));
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_business_invitations_pending_email
  ON public.business_invitations (business_id, lower(email))
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_business_invitations_email_status
  ON public.business_invitations (lower(email), status, expires_at);

DROP TRIGGER IF EXISTS set_updated_at ON public.business_invitations;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.business_invitations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.business_users
  ADD COLUMN IF NOT EXISTS membership_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.business_users
SET joined_at = created_at
WHERE joined_at IS NULL
  AND is_active = true;

UPDATE public.business_users
SET membership_status = CASE WHEN is_active THEN 'active' ELSE 'inactive' END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_users_membership_status_check'
      AND conrelid = 'public.business_users'::regclass
  ) THEN
    ALTER TABLE public.business_users
      ADD CONSTRAINT business_users_membership_status_check
      CHECK (membership_status IN ('active', 'inactive', 'archived'));
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_owner_membership_loss()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_active_owner_count integer;
  v_business_id uuid;
BEGIN
  v_business_id := COALESCE(OLD.business_id, NEW.business_id);

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'owner' AND OLD.is_active = true AND OLD.membership_status = 'active' THEN
      SELECT count(*) INTO v_active_owner_count
      FROM public.business_users
      WHERE business_id = OLD.business_id
        AND role = 'owner'
        AND is_active = true
        AND membership_status = 'active'
        AND id <> OLD.id;

      IF v_active_owner_count = 0 THEN
        RAISE EXCEPTION 'At least one active owner must remain.';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.role = 'owner'
     AND OLD.is_active = true
     AND OLD.membership_status = 'active'
     AND (
       NEW.role <> 'owner'
       OR NEW.is_active = false
       OR NEW.membership_status <> 'active'
     ) THEN
    SELECT count(*) INTO v_active_owner_count
    FROM public.business_users
    WHERE business_id = v_business_id
      AND role = 'owner'
      AND is_active = true
      AND membership_status = 'active'
      AND id <> OLD.id;

    IF v_active_owner_count = 0 THEN
      RAISE EXCEPTION 'At least one active owner must remain.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_last_owner_membership_loss ON public.business_users;
CREATE TRIGGER prevent_last_owner_membership_loss
  BEFORE UPDATE OR DELETE ON public.business_users
  FOR EACH ROW EXECUTE FUNCTION public.prevent_last_owner_membership_loss();

ALTER TABLE public.business_people
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

UPDATE public.business_people
SET status = CASE
  WHEN invite_status = 'pending' THEN 'invited'
  WHEN is_active THEN 'active'
  ELSE 'inactive'
END;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'business_people_status_check'
      AND conrelid = 'public.business_people'::regclass
  ) THEN
    ALTER TABLE public.business_people
      ADD CONSTRAINT business_people_status_check
      CHECK (status IN ('invited', 'active', 'inactive', 'archived'));
  END IF;
END;
$$;

ALTER TABLE public.business_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_invitations_admin_read" ON public.business_invitations
  FOR SELECT USING (public.is_business_admin(business_id));
CREATE POLICY "business_invitations_invitee_read" ON public.business_invitations
  FOR SELECT USING (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));
CREATE POLICY "business_invitations_admin_insert" ON public.business_invitations
  FOR INSERT WITH CHECK (public.is_business_admin(business_id) AND created_by = auth.uid());
CREATE POLICY "business_invitations_admin_update" ON public.business_invitations
  FOR UPDATE USING (public.is_business_admin(business_id));

CREATE OR REPLACE FUNCTION public.expire_business_invitations()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.business_invitations
  SET status = 'expired'
  WHERE status = 'pending'
    AND expires_at <= now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_business_invitation(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.business_invitations%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
  v_membership_id uuid;
  v_person_id uuid;
BEGIN
  IF v_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  PERFORM public.expire_business_invitations();

  SELECT * INTO v_invitation
  FROM public.business_invitations
  WHERE id = p_invitation_id
    AND lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending';
  END IF;

  INSERT INTO public.business_users (
    business_id, user_id, role, relationship_type, position_id,
    is_active, membership_status, joined_at
  )
  VALUES (
    v_invitation.business_id, v_user_id, v_invitation.role,
    v_invitation.relationship_type, v_invitation.position_id,
    true, 'active', now()
  )
  ON CONFLICT (business_id, user_id) DO UPDATE
  SET role = excluded.role,
      relationship_type = excluded.relationship_type,
      position_id = excluded.position_id,
      is_active = true,
      membership_status = 'active',
      joined_at = COALESCE(public.business_users.joined_at, now()),
      archived_at = NULL
  RETURNING id INTO v_membership_id;

  SELECT id INTO v_person_id
  FROM public.business_people
  WHERE business_id = v_invitation.business_id
    AND lower(coalesce(email, '')) = v_email
    AND invite_status = 'pending'
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO public.business_people (
      business_id, user_id, business_user_id, name, email,
      relationship_type, role, position_id, is_active,
      invite_status, status, metadata
    )
    VALUES (
      v_invitation.business_id, v_user_id, v_membership_id, v_email,
      v_invitation.email, v_invitation.relationship_type, v_invitation.role,
      v_invitation.position_id, true, 'accepted', 'active',
      jsonb_build_object('source', 'accepted_invitation')
    );
  ELSE
    UPDATE public.business_people
    SET user_id = v_user_id,
        business_user_id = v_membership_id,
        relationship_type = v_invitation.relationship_type,
        role = v_invitation.role,
        position_id = v_invitation.position_id,
        is_active = true,
        invite_status = 'accepted',
        status = 'active'
    WHERE id = v_person_id;
  END IF;

  UPDATE public.business_invitations
  SET status = 'accepted',
      accepted_by = v_user_id,
      accepted_at = now()
  WHERE id = p_invitation_id;

  INSERT INTO public.notifications (business_id, user_id, type, title, message, metadata)
  VALUES (
    v_invitation.business_id,
    v_invitation.created_by,
    'invitation_accepted',
    'Invitation accepted',
    v_invitation.email || ' joined the business.',
    jsonb_build_object('invitation_id', p_invitation_id, 'user_id', v_user_id)
  );

  INSERT INTO public.audit_logs (business_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_invitation.business_id,
    v_user_id,
    'create',
    'business_users',
    v_membership_id,
    NULL,
    jsonb_build_object('event', 'invitation_accepted', 'invitation_id', p_invitation_id)
  );

  RETURN v_membership_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decline_business_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.business_invitations%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
BEGIN
  IF v_user_id IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT * INTO v_invitation
  FROM public.business_invitations
  WHERE id = p_invitation_id
    AND lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending';
  END IF;

  UPDATE public.business_invitations
  SET status = 'declined',
      declined_at = now()
  WHERE id = p_invitation_id;

  UPDATE public.business_people
  SET invite_status = 'revoked',
      status = 'archived',
      is_active = false,
      archived_at = now()
  WHERE business_id = v_invitation.business_id
    AND lower(coalesce(email, '')) = v_email
    AND invite_status = 'pending';

  INSERT INTO public.notifications (business_id, user_id, type, title, message, metadata)
  VALUES (
    v_invitation.business_id,
    v_invitation.created_by,
    'invitation_declined',
    'Invitation declined',
    v_invitation.email || ' declined the invitation.',
    jsonb_build_object('invitation_id', p_invitation_id)
  );

  INSERT INTO public.audit_logs (business_id, user_id, action, table_name, record_id, old_data, new_data)
  VALUES (
    v_invitation.business_id,
    v_user_id,
    'update',
    'business_invitations',
    p_invitation_id,
    jsonb_build_object('status', 'pending'),
    jsonb_build_object('status', 'declined')
  );
END;
$$;

INSERT INTO public.permissions (key, module_key, action) VALUES
  ('invitations.view',   'people', 'view'),
  ('invitations.create', 'people', 'create'),
  ('invitations.update', 'people', 'update'),
  ('invitations.delete', 'people', 'delete')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.role_permissions (role, permission_key)
SELECT 'owner', key
FROM public.permissions
WHERE key LIKE 'invitations.%'
ON CONFLICT DO NOTHING;
