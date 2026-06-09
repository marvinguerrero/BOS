'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'
import type { Order, OrderStatus } from '@/types'

const STATUS_COLOR_CLASS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  green: 'bg-green-100 text-green-700',
  slate: 'bg-slate-100 text-slate-700',
}

interface Props {
  businessId: string
  initialOrders: Order[]
  statuses: OrderStatus[]
}

export function LaundryOrdersView({ businessId, initialOrders, statuses }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const sortedStatuses = [...statuses].sort((a, b) => a.sort_order - b.sort_order)
  const statusById = new Map(sortedStatuses.map(status => [status.id, status]))
  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status_id === statusFilter)

  const advanceStatus = async (order: Order) => {
    if (!order.status_id) return
    const currentStatus = statusById.get(order.status_id)
    if (!currentStatus) return
    const next = sortedStatuses.find(status => status.sort_order > currentStatus.sort_order)
    if (!next) return
    setUpdating(order.id)
    const supabase = createClient()

    const isLastStatus = !sortedStatuses.some(status => status.sort_order > next.sort_order)
    const update: Record<string, string> = { status_id: next.id }
    if (isLastStatus) update.completed_at = new Date().toISOString()

    await supabase.from('orders').update(update).eq('id', order.id)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...update } as Order : o))
    toast.success(`Order marked as ${next.name}`)
    setUpdating(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{orders.length} active orders</p>
        </div>
        <Link href={`/${businessId}/orders/new`}>
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            New Order
          </Button>
        </Link>
      </div>

      <div className="mb-4">
        <Select value={statusFilter} onValueChange={(v: string | null) => setStatusFilter(v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            {sortedStatuses.map(status => (
              <SelectItem key={status.id} value={status.id}>{status.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-muted-foreground">No orders found</CardContent></Card>
        ) : (
          filtered.map(order => {
            const status = order.status_id ? statusById.get(order.status_id) : undefined
            const nextStatus = status
              ? sortedStatuses.find(candidate => candidate.sort_order > status.sort_order)
              : undefined
            const service = order.service
            const customerName = order.customer_name_snapshot ?? order.customer_name ?? 'Walk-in Customer'
            const customerContact = order.customer_mobile_snapshot ?? order.customer_contact
            const assignedName = order.assigned_person?.name
            const assignedPosition = order.assigned_position?.name ?? order.assigned_person?.position?.name
            return (
              <Card key={order.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR_CLASS[status?.color ?? 'slate'] ?? STATUS_COLOR_CLASS.slate}`}>
                          {status?.name ?? 'Unassigned'}
                        </span>
                        <span className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                      </div>
                      <p className="font-semibold">{customerName}</p>
                      {customerContact && <p className="text-sm text-muted-foreground">{customerContact}</p>}
                      <p className="text-sm text-muted-foreground mt-1">
                        {service?.name}
                      </p>
                      {assignedName && (
                        <p className="text-xs text-muted-foreground">
                          Assigned to {assignedName}{assignedPosition ? ` · ${assignedPosition}` : ''}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">{formatDateTime(order.received_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{formatCurrency(order.total_amount)}</p>
                      {nextStatus && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 text-xs"
                          disabled={updating === order.id}
                          onClick={() => advanceStatus(order)}
                        >
                          Mark {nextStatus.name}
                          <ChevronRight className="h-3 w-3 ml-1" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })
        )}
      </div>
    </div>
  )
}
