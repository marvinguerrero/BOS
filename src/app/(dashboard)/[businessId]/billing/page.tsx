import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { BillingView } from '@/components/modules/billing/billing-view'

export const metadata: Metadata = { title: 'Billing' }

export default async function BillingPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const { data: bills } = await supabase
    .from('rent_bills')
    .select('*, tenants(name, contact_number), rooms(room_number)')
    .eq('business_id', businessId)
    .order('due_date', { ascending: true })
    .limit(100)

  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, room_id, monthly_rate')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('name')

  return <BillingView businessId={businessId} initialBills={bills ?? []} tenants={tenants ?? []} />
}
