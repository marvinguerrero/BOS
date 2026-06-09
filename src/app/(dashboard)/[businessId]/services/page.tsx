import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LaundryServicesView } from '@/components/modules/laundry/services-view'

export const metadata: Metadata = { title: 'Services' }

export default async function ServicesPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: services } = await supabase
    .from('services')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')
  return <LaundryServicesView businessId={businessId} initialServices={services ?? []} />
}
