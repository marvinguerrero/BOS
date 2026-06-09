'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/utils/currency'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

const STATUS_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 text-blue-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
  green: 'bg-green-100 text-green-700',
  slate: 'bg-slate-100 text-slate-700',
}

async function fetchQueue(businessId: string, type: string) {
  const supabase = createClient()

  if (type === 'laundry_ready') {
    const { count } = await supabase
      .from('orders')
      .select('id, order_statuses!inner(name)', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('order_statuses.name', 'Ready')
    return { type: 'count', label: 'Ready for pickup', value: count ?? 0 }
  }

  if (type === 'service_breakdown') {
    const { data } = await supabase
      .from('orders')
      .select('order_statuses(name, color)')
      .eq('business_id', businessId)
      .is('completed_at', null)
    const counts: Record<string, { count: number; color: string | null }> = {}
    const rows = (data ?? []) as { order_statuses?: { name: string; color: string | null } | null }[]
    rows.forEach(order => {
      const status = order.order_statuses
      if (!status) return
      counts[status.name] = {
        count: (counts[status.name]?.count ?? 0) + 1,
        color: status.color,
      }
    })
    return { type: 'breakdown', counts }
  }

  // active orders
  const { count } = await supabase
    .from('orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .is('completed_at', null)
  return { type: 'count', label: 'Active orders', value: count ?? 0 }
}

export function LaundryQueueWidget({ businessId, widget }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchQueue(businessId, widget.type),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <ClipboardList className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-12 bg-slate-100 rounded animate-pulse" />
        ) : data?.type === 'count' ? (
          <>
            <div className="text-2xl font-bold">{formatNumber(data.value)}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.label}</p>
          </>
        ) : data?.type === 'breakdown' ? (
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(data.counts as Record<string, { count: number; color: string | null }>).map(([status, value]) => (
              <div key={status} className={`rounded-lg px-2 py-1.5 ${STATUS_COLORS[value.color ?? 'slate'] ?? STATUS_COLORS.slate}`}>
                <p className="text-xs font-medium">{status}</p>
                <p className="text-lg font-bold">{value.count}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
