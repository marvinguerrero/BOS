import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { RoomsView } from '@/components/modules/rooms/rooms-view'

export const metadata: Metadata = { title: 'Rooms' }

export default async function RoomsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: rooms } = await supabase
    .from('rooms')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('room_number')
  return <RoomsView businessId={businessId} initialRooms={rooms ?? []} />
}
