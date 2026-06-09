'use client'

import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/utils/currency'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchCount(businessId: string, type: string) {
  const supabase = createClient()
  const start = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()

  if (type === 'orders_today') {
    const { count } = await supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', start)
    return count ?? 0
  }

  const { count } = await supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', start)
  return count ?? 0
}

export function TransactionsWidget({ businessId, widget }: Props) {
  const { data = 0, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchCount(businessId, widget.type),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <ShoppingCart className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-12 bg-slate-100 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-bold">{formatNumber(data)}</div>
        )}
        <p className="text-xs text-muted-foreground mt-1">Today</p>
      </CardContent>
    </Card>
  )
}
