import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NewOrderView } from '@/components/modules/laundry/new-order-view'

export const metadata: Metadata = { title: 'New Laundry Order' }

export default async function NewOrderPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: services } = await supabase
    .from('laundry_services')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')
  return <NewOrderView businessId={businessId} services={services ?? []} />
}
