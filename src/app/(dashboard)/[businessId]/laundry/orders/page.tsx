import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LaundryOrdersView } from '@/components/modules/laundry/orders-view'

export const metadata: Metadata = { title: 'Laundry Orders' }

export default async function LaundryOrdersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: orders } = await supabase
    .from('laundry_orders')
    .select('*, laundry_services(name, pricing_type, price)')
    .eq('business_id', businessId)
    .neq('status', 'claimed')
    .order('created_at', { ascending: false })
  return <LaundryOrdersView businessId={businessId} initialOrders={orders ?? []} />
}
