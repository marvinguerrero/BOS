import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { asQ } from '@/lib/supabase/typed-client'
import { DashboardView } from '@/components/dashboard/dashboard-view'
import { PendingInvitationsPanel } from '@/components/people/pending-invitations-panel'
import { getBusinessModelLabels } from '@/lib/business-models'
import type { BusinessInvitation, BusinessPerson, DashboardWidgetConfig, Position, RelationshipType, TemplateConfig, BusinessTemplateKey, UserRole, StaffPerformanceRow } from '@/types'

const BUSINESS_REVENUE_WIDGETS = new Set([
  'account_balances',
  'collections_by_account_today',
  'collections_by_account_month',
  'top_products',
])
const REVENUE_WIDGETS = new Set([
  'revenue_today',
  'revenue_month',
  'sales_trend',
  'collection_trend',
  ...BUSINESS_REVENUE_WIDGETS,
])

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

  const [
    templateResult,
    modelsResult,
    membershipResult,
    personResult,
    salesTodayResult,
    personalRevenuePermissionResult,
    businessRevenuePermissionResult,
    invitationsResult,
  ] = await Promise.all([
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
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'reports.view_personal_revenue',
    }),
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'reports.view_business_revenue',
    }),
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
  const canViewBusinessRevenue = businessRevenuePermissionResult.data === true
  const canViewPersonalRevenue = personalRevenuePermissionResult.data === true
  const revenueScope = {
    mode: canViewBusinessRevenue ? 'business' : canViewPersonalRevenue ? 'personal' : 'hidden',
    currentUserId: user.id,
    currentPersonId: person?.id ?? null,
  } as const
  const dashboardWidgets = (config?.dashboard_widgets ?? []).filter((widget: DashboardWidgetConfig) => {
    if (revenueScope.mode === 'hidden' && REVENUE_WIDGETS.has(widget.type)) return false
    return canViewBusinessRevenue || !BUSINESS_REVENUE_WIDGETS.has(widget.type)
  })

  const { count: assignedOrdersToday } = person
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('assigned_to_person_id', person.id)
      .gte('created_at', today.toISOString())
    : { count: 0 }

  const [{ data: mySalesRevenueRows }, { data: compRows }] = await Promise.all([
    supabase
      .from('sales')
      .select('total')
      .eq('business_id', businessId)
      .eq('cashier_id', user.id)
      .eq('status', 'completed')
      .gte('created_at', today.toISOString()),
    (() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any)
        .from('order_compensations')
        .select(`
          order_id,
          service_id,
          worker_person_id,
          worker_user_id,
          service_amount,
          owner_revenue_share,
          worker_commission_amount,
          owner_tip_amount,
          worker_tip_amount,
          worker_total_amount,
          worker_person:business_people!order_compensations_worker_person_id_fkey(
            id,
            name,
            position_id,
            position:positions(id, name)
          )
        `)
        .eq('business_id', businessId)
        .gte('calculated_at', today.toISOString())
      if (!canViewBusinessRevenue) {
        query = person ? query.eq('worker_person_id', person.id) : query.is('worker_person_id', null)
      }
      return query
    })(),
  ])
  const compensationRows = (compRows ?? []) as {
    order_id: string
    service_id: string | null
    worker_person_id: string | null
    worker_user_id: string | null
    service_amount: number
    owner_revenue_share: number
    worker_commission_amount: number
    owner_tip_amount: number
    worker_tip_amount: number
    worker_total_amount: number
    worker_person?: {
      id: string
      name: string
      position_id: string | null
      position?: { id: string; name: string } | null
    } | null
  }[]
  const myRevenueToday =
    ((mySalesRevenueRows ?? []) as { total: number }[]).reduce((sum, row) => sum + row.total, 0) +
    compensationRows.reduce((sum, row) => sum + row.service_amount, 0)
  const tipsToday = compensationRows.reduce((sum, row) =>
    sum + (canViewBusinessRevenue ? row.owner_tip_amount + row.worker_tip_amount : row.worker_tip_amount), 0)
  const workerEarningsToday = compensationRows.reduce((sum, row) => sum + row.worker_commission_amount, 0)
  const totalEarningsToday = compensationRows.reduce((sum, row) => sum + row.worker_total_amount, 0)
  const ownerShareToday = compensationRows.reduce((sum, row) => sum + row.owner_revenue_share, 0)
  const staffPerformanceToday = (() => {
    if (!canViewBusinessRevenue) return []
    const map = new Map<string, StaffPerformanceRow & { services: Set<string>; orders: Set<string> }>()
    compensationRows.forEach(row => {
      const key = row.worker_person_id ?? row.worker_user_id ?? 'unassigned'
      const existing = map.get(key)
      const worker = row.worker_person
      const next = existing ?? {
        workerPersonId: row.worker_person_id,
        workerUserId: row.worker_user_id,
        employeeName: worker?.name ?? 'Unassigned',
        positionId: worker?.position_id ?? null,
        positionName: worker?.position?.name ?? null,
        revenueGenerated: 0,
        commissionEarned: 0,
        tipsReceived: 0,
        totalEarnings: 0,
        servicesCompleted: 0,
        ordersCompleted: 0,
        services: new Set<string>(),
        orders: new Set<string>(),
      }
      next.revenueGenerated += row.service_amount
      next.commissionEarned += row.worker_commission_amount
      next.tipsReceived += row.worker_tip_amount
      next.totalEarnings += row.worker_total_amount
      if (row.service_id) next.services.add(row.service_id)
      next.orders.add(row.order_id)
      next.servicesCompleted = next.services.size
      next.ordersCompleted = next.orders.size
      map.set(key, next)
    })
    return [...map.values()]
      .map(({ services: _services, orders: _orders, ...row }) => row)
      .sort((a, b) => b.revenueGenerated - a.revenueGenerated)
  })()

  return (
    <>
      <PendingInvitationsPanel initialInvitations={pendingInvitations} />
      <DashboardView
        businessId={businessId}
        businessName={business.name}
        modelLabels={getBusinessModelLabels(modelKeys)}
        widgets={dashboardWidgets}
        revenueScope={revenueScope}
        myProfile={membership ? {
          relationshipType: membership.relationship_type ?? (membership.role === 'owner' ? 'owner' : 'employee'),
          role: membership.role,
          positionName: person?.position?.name ?? null,
        } : null}
        myActivity={{
          salesToday: salesTodayResult.count ?? 0,
          assignedOrdersToday: assignedOrdersToday ?? 0,
          revenueToday: myRevenueToday,
          revenueLabel: canViewBusinessRevenue ? 'Business Revenue Today' : 'Revenue Generated Today',
          tipsToday,
          tipsLabel: canViewBusinessRevenue ? 'Employee Tips Today' : 'My Tips Today',
          workerEarningsToday,
          workerEarningsLabel: canViewBusinessRevenue ? 'Employee Earnings Today' : 'My Earnings Today',
          totalEarningsToday,
          totalEarningsLabel: canViewBusinessRevenue ? 'Worker Total Earnings' : 'Total Earnings Today',
          ownerShareToday,
          ownerShareLabel: 'Owner Share Today',
        }}
        staffPerformance={staffPerformanceToday}
      />
    </>
  )
}
