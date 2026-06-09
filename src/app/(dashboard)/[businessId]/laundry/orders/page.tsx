import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LaundryOrdersView } from '@/components/modules/laundry/orders-view'
import type { FinancialAccount, UserRole, WorkflowTransition } from '@/types'

export const metadata: Metadata = { title: 'Orders' }

export default async function LaundryOrdersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  const [{ data: orders }, { data: statuses }, { data: financialAccounts }, workflowResult, membershipResult, personResult, updatePermissionResult, correctionSettingsResult] = await Promise.all([
    supabase
      .from('orders')
      .select('*, services(name, description, price, duration_minutes, is_active, metadata, created_at, updated_at), order_statuses(*), assigned_person:business_people(*, position:positions(*)), assigned_position:positions(*), order_payments(*, financial_account:financial_accounts(*)), payment_corrections(*)')
      .eq('business_id', businessId)
      .is('completed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_statuses')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order'),
    db
      .from('financial_accounts')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('sort_order'),
    db
      .from('workflow_definitions')
      .select('id, workflow_transitions(*)')
      .eq('business_id', businessId)
      .eq('transaction_type', 'service_order')
      .maybeSingle(),
    supabase
      .from('business_users')
      .select('role')
      .eq('business_id', businessId)
      .eq('user_id', user?.id ?? '')
      .eq('is_active', true)
      .maybeSingle(),
    db
      .from('business_people')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', user?.id ?? '')
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'orders.update',
    }),
    db
      .from('payment_correction_settings')
      .select('operator_time_limit_mins')
      .eq('business_id', businessId)
      .maybeSingle(),
  ])

  const { data: directTransitions } = workflowResult.data?.id
    ? await db
        .from('workflow_transitions')
        .select('*')
        .eq('workflow_id', workflowResult.data.id)
        .order('sort_order')
    : { data: null }

  const transitions: WorkflowTransition[] =
    ((directTransitions ?? workflowResult.data?.workflow_transitions) ?? []) as WorkflowTransition[]

  const normalizedOrders = (orders ?? []).map((order: Record<string, unknown>) => ({
    ...order,
    service: order.services,
    order_status: order.order_statuses,
    assigned_person: order.assigned_person,
    assigned_position: order.assigned_position,
  }))

  return (
    <LaundryOrdersView
      businessId={businessId}
      initialOrders={normalizedOrders}
      statuses={statuses ?? []}
      transitions={transitions}
      financialAccounts={(financialAccounts ?? []) as FinancialAccount[]}
      currentUserId={user?.id ?? ''}
      currentPersonId={personResult.data?.id ?? null}
      role={(membershipResult.data?.role ?? 'staff') as UserRole}
      canUpdateOrders={updatePermissionResult.data === true}
      paymentCorrectionLimitMinutes={correctionSettingsResult.data?.operator_time_limit_mins ?? 15}
    />
  )
}
