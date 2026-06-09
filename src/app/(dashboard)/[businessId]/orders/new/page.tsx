import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NewOrderView } from '@/components/modules/laundry/new-order-view'

export const metadata: Metadata = { title: 'New Order' }

export default async function NewOrderPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const [{ data: services }, { data: statuses }, { data: customers }, { data: people }] = await Promise.all([
    supabase
      .from('services')
      .select('*')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
    supabase
      .from('order_statuses')
      .select('*')
      .eq('business_id', businessId)
      .order('sort_order'),
    supabase
      .from('customers')
      .select('id, name, contact_number, outstanding_balance')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from('business_people')
      .select('*, positions(*)')
      .eq('business_id', businessId)
      .eq('is_active', true)
      .order('name'),
  ])
  return <NewOrderView businessId={businessId} services={services ?? []} statuses={statuses ?? []} customers={customers ?? []} people={people ?? []} />
}
