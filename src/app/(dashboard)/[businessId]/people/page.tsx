import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { PeopleView } from '@/components/people/people-view'
import type { BusinessInvitation, BusinessPerson, Position, RelationshipType, UserRole } from '@/types'

export const metadata: Metadata = { title: 'Team' }

type BusinessUserRow = {
  id: string
  business_id: string
  user_id: string
  role: UserRole
  relationship_type: RelationshipType | null
  position_id: string | null
  is_active: boolean
  membership_status?: 'active' | 'inactive' | 'archived'
  joined_at?: string | null
  archived_at?: string | null
  created_at: string
  updated_at?: string
}

export default async function PeoplePage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: canView } = await supabase.rpc('has_permission', {
    p_business_id: businessId,
    p_permission_key: 'people.view',
  })
  if (!canView) redirect(`/${businessId}/dashboard`)

  const [membershipResult, positionsResult, peopleResult, businessUsersResult, invitationsResult] = await Promise.all([
    supabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('positions')
      .select('*')
      .eq('business_id', businessId)
      .order('is_active', { ascending: false })
      .order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_people')
      .select('*, positions(*)')
      .eq('business_id', businessId)
      .order('is_active', { ascending: false })
      .order('name'),
    supabase
      .from('business_users')
      .select('id, business_id, user_id, role, relationship_type, position_id, is_active, membership_status, joined_at, archived_at, created_at, updated_at')
      .eq('business_id', businessId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_invitations')
      .select('*, position:positions(*)')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false }),
  ])

  const role = (membershipResult.data?.role ?? 'staff') as UserRole
  const positions = ((positionsResult as { data: Position[] | null }).data ?? [])
  const peopleRows = ((peopleResult as { data: Array<BusinessPerson & { positions?: Position | null }> | null }).data ?? [])
    .map(person => ({
      ...person,
      position: person.positions ?? null,
    }))

  const businessUsers = (businessUsersResult.data ?? []) as BusinessUserRow[]
  const missingPeople = businessUsers
    .filter(member => !peopleRows.some(person => person.business_user_id === member.id))
    .map(member => ({
      id: member.id,
      business_id: member.business_id,
      user_id: member.user_id,
      business_user_id: member.id,
      name: member.user_id === user.id ? 'You' : 'Team Member',
      email: null,
      mobile_number: null,
      relationship_type: member.relationship_type ?? (member.role === 'owner' ? 'owner' : 'employee'),
      role: member.role,
      position_id: member.position_id,
      is_active: member.is_active,
      status: member.is_active ? 'active' : 'inactive',
      invite_status: 'accepted',
      archived_at: member.archived_at ?? null,
      scheduling_settings: {},
      payroll_settings: {},
      metadata: { source: 'business_users' },
      created_at: member.created_at,
      updated_at: member.updated_at ?? member.created_at,
      position: positions.find(position => position.id === member.position_id) ?? null,
    } satisfies BusinessPerson))

  const allPeople = [...peopleRows, ...missingPeople]
  const visiblePeople = role === 'staff'
    ? allPeople.filter(person => person.user_id === user.id)
    : allPeople
  const invitations = ((invitationsResult as { data: BusinessInvitation[] | null }).data ?? [])

  return (
    <PeopleView
      businessId={businessId}
      currentUserId={user.id}
      role={role}
      initialPositions={positions}
      initialPeople={visiblePeople}
      initialInvitations={role === 'owner' ? invitations : []}
    />
  )
}
