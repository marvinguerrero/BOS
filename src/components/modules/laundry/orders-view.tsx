'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useQueryClient } from '@tanstack/react-query'
import { Plus, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { formatDateTime } from '@/lib/utils/date'
import type { LaundryOrder, LaundryOrderStatus } from '@/types'

const STATUS_CONFIG: Record<LaundryOrderStatus, { label: string; color: string; next?: LaundryOrderStatus }> = {
  received: { label: 'Received', color: 'bg-blue-100 text-blue-700', next: 'washing' },
  washing:  { label: 'Washing',  color: 'bg-yellow-100 text-yellow-700', next: 'drying' },
  drying:   { label: 'Drying',   color: 'bg-orange-100 text-orange-700', next: 'ready' },
  ready:    { label: 'Ready',    color: 'bg-green-100 text-green-700', next: 'claimed' },
  claimed:  { label: 'Claimed',  color: 'bg-slate-100 text-slate-700' },
}

interface Props { businessId: string; initialOrders: LaundryOrder[] }

export function LaundryOrdersView({ businessId, initialOrders }: Props) {
  const [orders, setOrders] = useState(initialOrders)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [updating, setUpdating] = useState<string | null>(null)

  const filtered = statusFilter === 'all' ? orders : orders.filter(o => o.status === statusFilter)

  const advanceStatus = async (order: LaundryOrder) => {
    const next = STATUS_CONFIG[order.status].next
    if (!next) return
    setUpdating(order.id)
    const supabase = createClient()

    const update: Record<string, string> = { status: next }
    if (next === 'ready') update.ready_at = new Date().toISOString()
    if (next === 'claimed') update.claimed_at = new Date().toISOString()

    await supabase.from('laundry_orders').update(update).eq('id', order.id)
    setOrders(prev => prev.map(o => o.id === order.id ? { ...o, ...update } as LaundryOrder : o))
    toast.success(`Order marked as ${next}`)
    setUpdating(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Orders</h1>
          <p className="text-muted-foreground text-sm">{orders.length} active orders</p>
        </div>
        <Link href={`/${businessId}/laundry/orders/new`}>
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
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        {filtered.length === 0 ? (
          <Card><CardContent className="text-center py-8 text-muted-foreground">No orders found</CardContent></Card>
        ) : (
          filtered.map(order => {
            const statusCfg = STATUS_CONFIG[order.status]
            const o = order as LaundryOrder & { laundry_services?: { name: string } }
            return (
              <Card key={order.id} className="hover:shadow-sm transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusCfg.color}`}>
                          {statusCfg.label}
                        </span>
                        <span className="text-xs text-muted-foreground">#{order.id.slice(0, 8)}</span>
                      </div>
                      <p className="font-semibold">{order.customer_name}</p>
                      {order.customer_contact && <p className="text-sm text-muted-foreground">{order.customer_contact}</p>}
                      <p className="text-sm text-muted-foreground mt-1">
                        {o.laundry_services?.name}
                        {order.weight_kg ? ` · ${order.weight_kg}kg` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(order.received_at)}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-bold text-lg">{formatCurrency(order.total_amount)}</p>
                      {statusCfg.next && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="mt-2 text-xs"
                          disabled={updating === order.id}
                          onClick={() => advanceStatus(order)}
                        >
                          Mark {statusCfg.next}
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
