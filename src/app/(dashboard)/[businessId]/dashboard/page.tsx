import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { asQ } from '@/lib/supabase/typed-client'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { PendingInvitationsPanel } from '@/components/people/pending-invitations-panel'
import { getBusinessModelLabels } from '@/lib/business-models'
import type { BusinessInvitation, BusinessPerson, Position, RelationshipType, TemplateConfig, BusinessTemplateKey, UserRole } from '@/types'

export default async function BusinessDashboardPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const q = asQ(supabase)

  const { data: businessData } = await q
    .from('businesses')
    .select('id, name, template_key')
    .eq('id', businessId)
    .single()
  const business = businessData as { id: string; name: string; template_key: BusinessTemplateKey } | null
  if (!business) redirect('/dashboard')

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [templateResult, modelsResult, membershipResult, personResult, salesTodayResult, invitationsResult] = await Promise.all([
    q
      .from('templates')
      .select('config')
      .eq('key', business.template_key)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_business_models')
      .select('model_key')
      .eq('business_id', businessId),
    supabase
      .from('business_users')
      .select('id, role, relationship_type, position_id')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .single(),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_people')
      .select('*, position:positions(*)')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('sales')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('cashier_id', user.id)
      .gte('created_at', today.toISOString()),
    user.email
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? (supabase as any)
        .from('business_invitations')
        .select('*, business:businesses(id, name), position:positions(*)')
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .ilike('email', user.email)
        .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
  ])
  const templateData = templateResult.data
  const config = (templateData as { config: TemplateConfig } | null)?.config
  const modelKeys = ((modelsResult as { data: { model_key: string }[] | null }).data ?? [])
    .map(row => row.model_key)
  const person = (personResult as { data: (BusinessPerson & { position?: Position | null }) | null }).data
  const membership = membershipResult.data as {
    id: string
    role: UserRole
    relationship_type: RelationshipType | null
    position_id: string | null
  } | null
  const pendingInvitations = ((invitationsResult as { data: BusinessInvitation[] | null }).data ?? [])

  const { count: assignedOrdersToday } = person
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('assigned_to_person_id', person.id)
      .gte('created_at', today.toISOString())
    : { count: 0 }

  return (
    <>
      <PendingInvitationsPanel initialInvitations={pendingInvitations} />
      <DashboardView
        businessId={businessId}
        businessName={business.name}
        modelLabels={getBusinessModelLabels(modelKeys)}
        widgets={config?.dashboard_widgets ?? []}
        myProfile={membership ? {
          relationshipType: membership.relationship_type ?? (membership.role === 'owner' ? 'owner' : 'employee'),
          role: membership.role,
          positionName: person?.position?.name ?? null,
        } : null}
        myActivity={{
          salesToday: salesTodayResult.count ?? 0,
          assignedOrdersToday: assignedOrdersToday ?? 0,
        }}
      />
    </>
  )
}
