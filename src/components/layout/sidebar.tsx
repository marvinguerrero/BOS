'use client'

import Link from 'next/link'
import { usePathname, useParams } from 'next/navigation'
import {
  LayoutDashboard, ShoppingCart, Receipt, Package, Users, BarChart2,
  Bell, Settings, ClipboardList, Layers, DoorOpen, CreditCard, X, Plus,
  Store, Home, Wallet,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useBusinessStore } from '@/stores/business.store'
import { getNavigation } from '@/lib/template-engine'
import type { NavigationItem } from '@/types'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  LayoutDashboard, ShoppingCart, Receipt, Package, Users, BarChart2,
  Bell, Settings, ClipboardList, Layers, DoorOpen, CreditCard, Plus, Store, Home, Wallet,
}

function NavItem({ item, currentPath }: { item: NavigationItem; currentPath: string }) {
  const Icon = ICON_MAP[item.icon] ?? LayoutDashboard
  const isActive = currentPath === item.href || currentPath.startsWith(item.href + '/')

  return (
    <Link
      href={item.href}
      className={cn(
        'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{item.label}</span>
    </Link>
  )
}

interface SidebarProps {
  open: boolean
  onClose: () => void
  businessUsers: Array<{ businesses: { id: string; name: string; template_key: string } | null; role: string }>
}

export function Sidebar({ open, onClose, businessUsers }: SidebarProps) {
  const pathname = usePathname()
  const params = useParams()
  const businessId = params?.businessId as string | undefined
  const { activeBusiness, activeRole, templateConfig } = useBusinessStore()

  const navigation: NavigationItem[] = templateConfig && activeBusiness && activeRole
    ? getNavigation(templateConfig, activeRole, activeBusiness.id)
    : []

  const sidebarContent = (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 items-center px-4 border-b">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm">B</div>
          <span className="font-bold text-slate-900">BOS</span>
        </div>
        <Button variant="ghost" size="icon" className="ml-auto lg:hidden" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 px-3 py-3">
        {/* Business selector */}
        {activeBusiness ? (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Business</p>
            <div className="rounded-lg bg-slate-100 px-3 py-2">
              <p className="text-sm font-medium text-slate-800 truncate">{activeBusiness.name}</p>
              <p className="text-xs text-slate-500 capitalize">{activeBusiness.template_key.replace('_', ' ')}</p>
            </div>
          </div>
        ) : null}

        {/* Navigation */}
        {navigation.length > 0 ? (
          <div className="space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Menu</p>
            {navigation.map(item => (
              <NavItem key={item.key} item={item} currentPath={pathname} />
            ))}
          </div>
        ) : (
          <div className="space-y-1">
            <NavItem
              item={{ key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: 'LayoutDashboard' }}
              currentPath={pathname}
            />
          </div>
        )}

        {/* Finance — always visible when a business is active */}
        {activeBusiness && (
          <div className="mt-4 space-y-1">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Finance</p>
            <NavItem
              item={{ key: 'accounts', label: 'Accounts', href: `/${activeBusiness.id}/accounts`, icon: 'Wallet' }}
              currentPath={pathname}
            />
          </div>
        )}

        {/* Other businesses */}
        {businessUsers.length > 0 && (
          <>
            <Separator className="my-4" />
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-2 mb-2">Switch Business</p>
            {businessUsers.map(bu => {
              if (!bu.businesses) return null
              return (
                <Link
                  key={bu.businesses.id}
                  href={`/${bu.businesses.id}/dashboard`}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                    activeBusiness?.id === bu.businesses.id
                      ? 'bg-slate-200 text-slate-900'
                      : 'text-slate-600 hover:bg-slate-100'
                  )}
                >
                  <Store className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{bu.businesses.name}</span>
                </Link>
              )
            })}
          </>
        )}
      </ScrollArea>

      {/* Add business */}
      <div className="p-3 border-t">
        <Link href="/setup/step-1">
          <Button variant="outline" size="sm" className="w-full gap-2">
            <Plus className="h-3.5 w-3.5" />
            Add Business
          </Button>
        </Link>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r bg-white">
        {sidebarContent}
      </aside>

      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <aside className="absolute left-0 top-0 bottom-0 w-60 bg-white shadow-xl z-50">
            {sidebarContent}
          </aside>
        </div>
      )}
    </>
  )
}
