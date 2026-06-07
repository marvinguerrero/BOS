'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Menu, Bell, Search, LogOut, User, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { User as SupaUser } from '@supabase/supabase-js'
import type { UserProfile } from '@/types'
import { createClient } from '@/lib/supabase/client'
import { useNotificationStore } from '@/stores/notification.store'
import { useAuthStore } from '@/stores/auth.store'
import { useBusinessStore } from '@/stores/business.store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface HeaderProps {
  user: SupaUser
  profile: UserProfile | null
  onMenuClick: () => void
}

export function Header({ user, profile, onMenuClick }: HeaderProps) {
  const router = useRouter()
  const unreadCount = useNotificationStore(s => s.unreadCount)
  const clearAuth = useAuthStore(s => s.clear)
  const clearBusiness = useBusinessStore(s => s.clearActiveBusiness)
  const activeBusiness = useBusinessStore(s => s.activeBusiness)
  const [signingOut, setSigningOut] = useState(false)

  const initials = profile?.full_name
    ?.split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? 'U'

  const handleSignOut = async () => {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    clearAuth()
    clearBusiness()
    router.push('/auth/login')
  }

  return (
    <header className="flex h-14 items-center gap-3 border-b bg-white px-4">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onMenuClick}>
        <Menu className="h-5 w-5" />
      </Button>

      {/* Search shortcut */}
      <div className="flex-1">
        {activeBusiness && (
          <Link href={`/${activeBusiness.id}/search`}>
            <Button variant="outline" className="hidden md:flex items-center gap-2 text-muted-foreground w-64 justify-start font-normal">
              <Search className="h-4 w-4" />
              <span className="text-sm">Search...</span>
              <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
            </Button>
          </Link>
        )}
      </div>

      {/* Notifications */}
      {activeBusiness && (
        <Link href={`/${activeBusiness.id}/notifications`}>
          <Button variant="ghost" size="icon" className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                {unreadCount > 99 ? '99+' : unreadCount}
              </Badge>
            )}
          </Button>
        </Link>
      )}

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger>
          <div className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-muted transition-colors cursor-pointer">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url ?? undefined} />
              <AvatarFallback className="text-xs bg-primary text-primary-foreground">{initials}</AvatarFallback>
            </Avatar>
            <span className="hidden md:block text-sm font-medium max-w-[120px] truncate">
              {profile?.full_name ?? user.email}
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium truncate">{profile?.full_name ?? 'User'}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => router.push('/profile')}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSignOut} disabled={signingOut} className="text-destructive focus:text-destructive">
            <LogOut className="mr-2 h-4 w-4" />
            {signingOut ? 'Signing out...' : 'Sign out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
