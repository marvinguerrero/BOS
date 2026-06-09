import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { NotificationsView } from '@/components/shared/notifications-view'
import type { BusinessInvitation } from '@/types'

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

  const { data: invitations } = user?.email
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ? await (supabase as any)
      .from('business_invitations')
      .select('*, business:businesses(id, name), position:positions(*)')
      .eq('business_id', businessId)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .ilike('email', user.email)
      .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <NotificationsView
      businessId={businessId}
      initialNotifications={notifications ?? []}
      initialInvitations={(invitations ?? []) as BusinessInvitation[]}
    />
  )
}
