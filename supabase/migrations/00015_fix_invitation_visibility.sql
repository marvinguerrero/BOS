-- ============================================================================
-- FIX INVITATION VISIBILITY
-- ============================================================================
--
-- 1. Replace the invitee SELECT policy on business_invitations.
--    The old policy used auth.jwt() ->> 'email' which can return NULL/empty
--    if the JWT does not carry the email claim (e.g. right after a token
--    refresh before the new token is decoded). Reading from auth.users via
--    auth.uid() is always reliable because auth.uid() is set by the JWT sub
--    claim, which is always present for authenticated sessions.
--
-- 2. Update accept_business_invitation / decline_business_invitation to
--    resolve the calling user's email from auth.users instead of the JWT
--    email claim, for the same reason.

-- ── RLS policy fix ─────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "business_invitations_invitee_read" ON public.business_invitations;

CREATE POLICY "business_invitations_invitee_read" ON public.business_invitations
  FOR SELECT USING (
    lower(email) = (
      SELECT lower(u.email)
      FROM auth.users u
      WHERE u.id = auth.uid()
    )
  );

-- ── accept_business_invitation ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.accept_business_invitation(p_invitation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.business_invitations%ROWTYPE;
  v_user_id    uuid := auth.uid();
  v_email      text;
  v_membership_id uuid;
  v_person_id     uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Resolve email from auth.users (reliable; JWT email claim can be absent)
  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Could not determine authenticated user email';
  END IF;

  PERFORM public.expire_business_invitations();

  SELECT * INTO v_invitation
  FROM public.business_invitations
  WHERE id = p_invitation_id
    AND lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or email does not match';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending (status: %)', v_invitation.status;
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
    SET role                = excluded.role,
        relationship_type   = excluded.relationship_type,
        position_id         = excluded.position_id,
        is_active           = true,
        membership_status   = 'active',
        joined_at           = COALESCE(public.business_users.joined_at, now()),
        archived_at         = NULL
  RETURNING id INTO v_membership_id;

  SELECT id INTO v_person_id
  FROM public.business_people
  WHERE business_id  = v_invitation.business_id
    AND lower(COALESCE(email, '')) = v_email
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
      v_invitation.business_id, v_user_id, v_membership_id,
      v_email, v_invitation.email,
      v_invitation.relationship_type, v_invitation.role,
      v_invitation.position_id, true, 'accepted', 'active',
      jsonb_build_object('source', 'accepted_invitation')
    );
  ELSE
    UPDATE public.business_people
    SET user_id           = v_user_id,
        business_user_id  = v_membership_id,
        relationship_type = v_invitation.relationship_type,
        role              = v_invitation.role,
        position_id       = v_invitation.position_id,
        is_active         = true,
        invite_status     = 'accepted',
        status            = 'active'
    WHERE id = v_person_id;
  END IF;

  UPDATE public.business_invitations
  SET status      = 'accepted',
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

-- ── decline_business_invitation ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.decline_business_invitation(p_invitation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.business_invitations%ROWTYPE;
  v_user_id    uuid := auth.uid();
  v_email      text;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  SELECT lower(email) INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'Could not determine authenticated user email';
  END IF;

  SELECT * INTO v_invitation
  FROM public.business_invitations
  WHERE id = p_invitation_id
    AND lower(email) = v_email
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invitation not found or email does not match';
  END IF;
  IF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is not pending (status: %)', v_invitation.status;
  END IF;

  UPDATE public.business_invitations
  SET status      = 'declined',
      declined_at = now()
  WHERE id = p_invitation_id;

  UPDATE public.business_people
  SET invite_status = 'revoked',
      status        = 'archived',
      is_active     = false,
      archived_at   = now()
  WHERE business_id  = v_invitation.business_id
    AND lower(COALESCE(email, '')) = v_email
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
