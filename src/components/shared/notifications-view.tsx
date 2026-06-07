'use client'

import { useState } from 'react'
import { Bell, Check, CheckCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatRelative } from '@/lib/utils/date'
import { useNotificationStore } from '@/stores/notification.store'
import type { Notification } from '@/types'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

interface Props { businessId: string; initialNotifications: Notification[] }

export function NotificationsView({ businessId, initialNotifications }: Props) {
  const [notifications, setNotifications] = useState(initialNotifications)
  const { setNotifications: setStore, markAllRead } = useNotificationStore()

  useEffect(() => {
    setStore(initialNotifications)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialNotifications])

  const handleMarkAllRead = async () => {
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ status: 'read' })
      .eq('business_id', businessId)
      .eq('status', 'unread')
    setNotifications(prev => prev.map(n => ({ ...n, status: 'read' as const })))
    markAllRead()
  }

  const handleMarkRead = async (id: string) => {
    const supabase = createClient()
    await supabase.from('notifications').update({ status: 'read' }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, status: 'read' as const } : n))
  }

  const unreadCount = notifications.filter(n => n.status === 'unread').length

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Notifications</h1>
          {unreadCount > 0 && <p className="text-muted-foreground text-sm">{unreadCount} unread</p>}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={handleMarkAllRead} className="gap-2">
            <CheckCheck className="h-4 w-4" />
            Mark all read
          </Button>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Bell className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
            <p className="font-medium">No notifications</p>
            <p className="text-sm text-muted-foreground">You&apos;re all caught up!</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => (
            <Card
              key={n.id}
              className={cn('transition-all', n.status === 'unread' ? 'border-primary/30 bg-primary/5' : '')}
            >
              <CardContent className="flex items-start gap-3 p-4">
                <div className={cn(
                  'w-2 h-2 rounded-full mt-2 shrink-0',
                  n.status === 'unread' ? 'bg-primary' : 'bg-transparent'
                )} />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{n.title}</p>
                  <p className="text-sm text-muted-foreground mt-0.5">{n.message}</p>
                  <p className="text-xs text-muted-foreground mt-1">{formatRelative(n.created_at)}</p>
                </div>
                {n.status === 'unread' && (
                  <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => handleMarkRead(n.id)}>
                    <Check className="h-3.5 w-3.5" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
