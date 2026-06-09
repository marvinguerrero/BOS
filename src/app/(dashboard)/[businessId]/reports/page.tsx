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

  const { data: canView } = await supabase.rpc('has_permission', {
    p_business_id: businessId,
    p_permission_key: 'reports.view',
  })
  if (!canView) redirect(`/${businessId}/dashboard`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: modelRows } = await (supabase as any)
    .from('business_business_models')
    .select('model_key')
    .eq('business_id', businessId)

  const modelKeys = ((modelRows ?? []) as { model_key: string }[]).map(row => row.model_key)

  return <ReportsView businessId={businessId} modelKeys={modelKeys} />
}
