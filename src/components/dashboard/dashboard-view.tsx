'use client'

import type { DashboardWidgetConfig, RevenueScope, StaffPerformanceRow } from '@/types'
import { WidgetRenderer } from './widget-renderer'
import { cn } from '@/lib/utils'
import { formatCurrency } from '@/lib/utils/currency'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface DashboardViewProps {
  businessId: string
  businessName: string
  modelLabels: string[]
  widgets: DashboardWidgetConfig[]
  revenueScope: RevenueScope
  myProfile: {
    relationshipType: string
    role: string
    positionName: string | null
  } | null
  myActivity: {
    salesToday: number
    assignedOrdersToday: number
    revenueToday: number
    revenueLabel: string
    tipsToday: number
    tipsLabel: string
    workerEarningsToday: number
    workerEarningsLabel: string
    totalEarningsToday: number
    totalEarningsLabel: string
    ownerShareToday: number
    ownerShareLabel: string
  }
  staffPerformance?: StaffPerformanceRow[]
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

export function DashboardView({ businessId, businessName, modelLabels, widgets, revenueScope, myProfile, myActivity, staffPerformance = [] }: DashboardViewProps) {
  const showRevenueMetrics = revenueScope.mode !== 'hidden'
  const showBusinessMetrics = revenueScope.mode === 'business'

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{businessName}</h1>
        <p className="text-muted-foreground text-sm">
          Business Models: {modelLabels.length > 0 ? modelLabels.join(', ') : 'Business'}
        </p>
      </div>

      {myProfile && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-4 mb-4">
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
          {showRevenueMetrics && (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">{myActivity.revenueLabel}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(myActivity.revenueToday)}</p>
            </div>
          )}
          {showBusinessMetrics && (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">{myActivity.ownerShareLabel}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(myActivity.ownerShareToday)}</p>
            </div>
          )}
          {showRevenueMetrics && (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">{myActivity.workerEarningsLabel}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(myActivity.workerEarningsToday)}</p>
            </div>
          )}
          {showRevenueMetrics && (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">{myActivity.tipsLabel}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(myActivity.tipsToday)}</p>
            </div>
          )}
          {showRevenueMetrics && !showBusinessMetrics && (
            <div className="rounded-lg border bg-white p-4">
              <p className="text-sm text-muted-foreground">{myActivity.totalEarningsLabel}</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(myActivity.totalEarningsToday)}</p>
            </div>
          )}
        </div>
      )}

      {showBusinessMetrics && staffPerformance.length > 0 && (
        <Card className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Staff Performance Today</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Revenue Generated</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">Tips</TableHead>
                  <TableHead className="text-right">Total Earnings</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staffPerformance.slice(0, 5).map(row => (
                  <TableRow key={row.workerPersonId ?? row.workerUserId ?? row.employeeName}>
                    <TableCell>
                      <p className="font-medium">{row.employeeName}</p>
                      <p className="text-xs text-muted-foreground">{row.positionName ?? 'Unassigned'}</p>
                    </TableCell>
                    <TableCell className="text-right">{formatCurrency(row.revenueGenerated)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.commissionEarned)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(row.tipsReceived)}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(row.totalEarnings)}</TableCell>
                    <TableCell className="text-right">{row.ordersCompleted}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {widgets.map(widget => (
          <div key={widget.id} className={cn(SIZE_CLASS[widget.size] ?? 'col-span-1')}>
            <WidgetRenderer widget={widget} businessId={businessId} revenueScope={revenueScope} />
          </div>
        ))}
      </div>
    </div>
  )
}
