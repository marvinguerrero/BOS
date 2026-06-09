import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { LaundryOrdersView } from '@/components/modules/laundry/orders-view'

export const metadata: Metadata = { title: 'Orders' }

export default async function OrdersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const [{ data: orders }, { data: statuses }] = await Promise.all([
    supabase
      .from('orders')
      .select('*, services(name, description, price, duration_minutes, is_active, metadata, created_at, updated_at), order_statuses(*), assigned_person:business_people(*, position:positions(*)), assigned_position:positions(*)')
      .eq('business_id', businessId)
      .is('completed_at', null)
      .order('created_at', { ascending: false }),
    supabase
      .from('order_statuses')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order'),
  ])

  const normalizedOrders = (orders ?? []).map((order: Record<string, unknown>) => ({
    ...order,
    service: order.services,
    order_status: order.order_statuses,
    assigned_person: order.assigned_person,
    assigned_position: order.assigned_position,
  }))

  return <LaundryOrdersView businessId={businessId} initialOrders={normalizedOrders} statuses={statuses ?? []} />
}
