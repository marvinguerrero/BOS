import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NotificationsView } from '@/components/shared/notifications-view'

export const metadata: Metadata = { title: 'Notifications' }

export default async function NotificationsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: notifications } = await supabase
    .from('notifications')
    .select('*')
    .eq('business_id', businessId)
    .or(`user_id.is.null,user_id.eq.${user?.id}`)
    .order('created_at', { ascending: false })
    .limit(50)

  return <NotificationsView businessId={businessId} initialNotifications={notifications ?? []} />
}
