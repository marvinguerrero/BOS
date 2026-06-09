import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { WorkflowManagementView } from '@/components/business/workflow-management-view'
import type { OrderStatus, WorkflowDefinition, WorkflowTransition } from '@/types'

export const metadata: Metadata = { title: 'Workflow Management' }

export default async function WorkflowSettingsPage({
  params,
}: {
  params: Promise<{ businessId: string }>
}) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Only admins (owner / manager) can manage workflows.
  const { data: canView } = await supabase.rpc('has_permission', {
    p_business_id: businessId,
    p_permission_key: 'settings.view',
  })
  if (!canView) redirect(`/${businessId}/dashboard`)

  const membership = await supabase
    .from('business_users')
    .select('role')
    .eq('business_id', businessId)
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  const role = membership.data?.role ?? 'staff'
  if (role !== 'owner' && role !== 'manager') {
    redirect(`/${businessId}/settings`)
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any

  // Fetch or create the service_order workflow definition.
  let workflowResult = await db
    .from('workflow_definitions')
    .select('*')
    .eq('business_id', businessId)
    .eq('transaction_type', 'service_order')
    .maybeSingle()

  // If none exists yet (business pre-dates migration 00021), create it now.
  if (!workflowResult.data) {
    const { data: created } = await db
      .from('workflow_definitions')
      .insert({
        business_id: businessId,
        transaction_type: 'service_order',
        name: 'Service Orders',
        description: 'Lifecycle stages for service-based orders.',
      })
      .select()
      .single()
    workflowResult = { data: created }
  }

  const workflow = workflowResult.data as WorkflowDefinition | null
  if (!workflow) redirect(`/${businessId}/settings`)

  const [statusesResult, transitionsResult] = await Promise.all([
    db
      .from('order_statuses')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order'),
    db
      .from('workflow_transitions')
      .select('*')
      .eq('workflow_id', workflow.id)
      .order('sort_order'),
  ])

  return (
    <WorkflowManagementView
      businessId={businessId}
      workflow={workflow}
      initialStatuses={(statusesResult.data ?? []) as OrderStatus[]}
      initialTransitions={(transitionsResult.data ?? []) as WorkflowTransition[]}
    />
  )
}
