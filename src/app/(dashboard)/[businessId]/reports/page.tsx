import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import dynamic from 'next/dynamic'

const ReportsView = dynamic(
  () => import('@/components/modules/reports/reports-view').then(m => m.ReportsView)
)

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [
    { data: canViewReports },
    { data: canViewBusinessRevenue },
    { data: canViewPersonalRevenue },
    personResult,
  ] = await Promise.all([
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'reports.view',
    }),
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'reports.view_business_revenue',
    }),
    supabase.rpc('has_permission', {
      p_business_id: businessId,
      p_permission_key: 'reports.view_personal_revenue',
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_people')
      .select('id')
      .eq('business_id', businessId)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at')
      .limit(1)
      .maybeSingle(),
  ])
  if (!canViewReports || (!canViewBusinessRevenue && !canViewPersonalRevenue)) redirect(`/${businessId}/dashboard`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: modelRows } = await (supabase as any)
    .from('business_business_models')
    .select('model_key')
    .eq('business_id', businessId)

  const modelKeys = ((modelRows ?? []) as { model_key: string }[]).map(row => row.model_key)

  const revenueScope = {
    mode: canViewBusinessRevenue ? 'business' : canViewPersonalRevenue ? 'personal' : 'hidden',
    currentUserId: user.id,
    currentPersonId: personResult.data?.id ?? null,
  } as const

  return <ReportsView businessId={businessId} modelKeys={modelKeys} revenueScope={revenueScope} />
}
