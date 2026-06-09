'use client'

import type { DashboardWidgetConfig } from '@/types'
import { WidgetRenderer } from './widget-renderer'
import { cn } from '@/lib/utils'

interface DashboardViewProps {
  businessId: string
  businessName: string
  modelLabels: string[]
  widgets: DashboardWidgetConfig[]
  myProfile: {
    relationshipType: string
    role: string
    positionName: string | null
  } | null
  myActivity: {
    salesToday: number
    assignedOrdersToday: number
  }
}

const SIZE_CLASS: Record<string, string> = {
  sm: 'col-span-1',
  md: 'col-span-1 md:col-span-1',
  lg: 'col-span-1 md:col-span-2',
  xl: 'col-span-1 md:col-span-2 lg:col-span-3',
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  owner: 'Owner',
  employee: 'Employee',
  customer: 'Customer',
  tenant: 'Tenant',
  supplier_contact: 'Supplier Contact',
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner',
  manager: 'Manager',
  staff: 'Staff',
  viewer: 'Viewer',
}

export function DashboardView({ businessId, businessName, modelLabels, widgets, myProfile, myActivity }: DashboardViewProps) {
  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{businessName}</h1>
        <p className="text-muted-foreground text-sm">
          Business Models: {modelLabels.length > 0 ? modelLabels.join(', ') : 'Business'}
        </p>
      </div>

      {myProfile && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-muted-foreground">My Profile</p>
            <p className="font-semibold mt-1">{RELATIONSHIP_LABELS[myProfile.relationshipType] ?? myProfile.relationshipType}</p>
            <p className="text-sm text-muted-foreground">
              {ROLE_LABELS[myProfile.role] ?? myProfile.role}{myProfile.positionName ? ` · ${myProfile.positionName}` : ''}
            </p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-muted-foreground">My Sales Today</p>
            <p className="text-2xl font-bold mt-1">{myActivity.salesToday}</p>
          </div>
          <div className="rounded-lg border bg-white p-4">
            <p className="text-sm text-muted-foreground">My Assigned Orders</p>
            <p className="text-2xl font-bold mt-1">{myActivity.assignedOrdersToday}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map(widget => (
          <div key={widget.id} className={cn(SIZE_CLASS[widget.size] ?? 'col-span-1')}>
            <WidgetRenderer widget={widget} businessId={businessId} />
          </div>
        ))}
      </div>
    </div>
  )
}
