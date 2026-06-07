import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import dynamic from 'next/dynamic'

const ReportsView = dynamic(
  () => import('@/components/modules/reports/reports-view').then(m => m.ReportsView)
)

export const metadata: Metadata = { title: 'Reports' }

export default async function ReportsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('template_key')
    .eq('id', businessId)
    .single()

  return <ReportsView businessId={businessId} templateKey={business?.template_key ?? 'sari_sari'} />
}
