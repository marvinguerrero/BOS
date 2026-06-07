'use client'

import { useQuery } from '@tanstack/react-query'
import { ClipboardList } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/utils/currency'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

const STATUS_COLORS: Record<string, string> = {
  received: 'bg-blue-100 text-blue-700',
  washing: 'bg-yellow-100 text-yellow-700',
  drying: 'bg-orange-100 text-orange-700',
  ready: 'bg-green-100 text-green-700',
}

async function fetchQueue(businessId: string, type: string) {
  const supabase = createClient()

  if (type === 'laundry_ready') {
    const { count } = await supabase
      .from('laundry_orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .eq('status', 'ready')
    return { type: 'count', label: 'Ready for pickup', value: count ?? 0 }
  }

  if (type === 'service_breakdown') {
    const { data } = await supabase
      .from('laundry_orders')
      .select('status')
      .eq('business_id', businessId)
      .neq('status', 'claimed')
    const counts: Record<string, number> = { received: 0, washing: 0, drying: 0, ready: 0 };
    const rows = (data ?? []) as { status: string }[]
    rows.forEach(o => { if (o.status in counts) counts[o.status]++ })
    return { type: 'breakdown', counts }
  }

  // laundry_queue: active orders
  const { count } = await supabase
    .from('laundry_orders')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .in('status', ['received', 'washing', 'drying', 'ready'])
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
            {Object.entries(data.counts as Record<string, number>).map(([status, count]) => (
              <div key={status} className={`rounded-lg px-2 py-1.5 ${STATUS_COLORS[status]}`}>
                <p className="text-xs capitalize font-medium">{status}</p>
                <p className="text-lg font-bold">{count}</p>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}
