import { create } from 'zustand'
import type { Notification } from '@/types'

interface NotificationState {
  notifications: Notification[]
  unreadCount: number
  setNotifications: (notifications: Notification[]) => void
  markRead: (id: string) => void
  markAllRead: () => void
  addNotification: (notification: Notification) => void
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  setNotifications: (notifications) => {
    set({
      notifications,
      unreadCount: notifications.filter(n => n.status === 'unread').length,
    })
  },

  markRead: (id) => {
    set((state) => {
      const updated = state.notifications.map(n =>
        n.id === id ? { ...n, status: 'read' as const } : n
      )
      return { notifications: updated, unreadCount: updated.filter(n => n.status === 'unread').length }
    })
  },

  markAllRead: () => {
    set((state) => ({
      notifications: state.notifications.map(n => ({ ...n, status: 'read' as const })),
      unreadCount: 0,
    }))
  },

  addNotification: (notification) => {
    set((state) => ({
      notifications: [notification, ...state.notifications],
      unreadCount: state.unreadCount + (notification.status === 'unread' ? 1 : 0),
    }))
  },
}))
