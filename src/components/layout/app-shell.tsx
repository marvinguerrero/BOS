'use client'

import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '@/types'
import { useAuthStore } from '@/stores/auth.store'
import { Sidebar } from './sidebar'
import { Header } from './header'

interface AppShellProps {
  user: User
  profile: UserProfile | null
  businessUsers: Array<{ businesses: { id: string; name: string } | null; role: string }>
  children: React.ReactNode
}

export function AppShell({ user, profile, businessUsers, children }: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const setUser = useAuthStore(s => s.setUser)
  const setProfile = useAuthStore(s => s.setProfile)

  useEffect(() => {
    setUser(user)
    if (profile) setProfile(profile as UserProfile)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, profile?.id])

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        businessUsers={businessUsers}
      />
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header
          user={user}
          profile={profile}
          onMenuClick={() => setSidebarOpen(true)}
        />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
