import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { TenantsView } from '@/components/modules/rooms/tenants-view'

export const metadata: Metadata = { title: 'Tenants' }

export default async function TenantsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()

  const [{ data: tenants }, { data: rooms }] = await Promise.all([
    supabase.from('tenants').select('*, rooms(room_number)').eq('business_id', businessId).eq('is_active', true).order('name'),
    supabase.from('rooms').select('id, room_number, status').eq('business_id', businessId).eq('is_active', true).order('room_number'),
  ])

  return <TenantsView businessId={businessId} initialTenants={tenants ?? []} rooms={rooms ?? []} />
}
