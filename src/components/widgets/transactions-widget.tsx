'use client'

import { useQuery } from '@tanstack/react-query'
import { ShoppingCart } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatNumber } from '@/lib/utils/currency'
import type { DashboardWidgetConfig, RevenueScope } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig; revenueScope: RevenueScope }

async function fetchCount(businessId: string, type: string, revenueScope: RevenueScope) {
  const supabase = createClient()
  const start = new Date(new Date().setHours(0, 0, 0, 0)).toISOString()
  const isPersonal = revenueScope.mode === 'personal'

  if (type === 'orders_today') {
    if (isPersonal && !revenueScope.currentPersonId) return 0
    let query = supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', businessId)
      .gte('created_at', start)
    if (isPersonal && revenueScope.currentPersonId) {
      query = query.eq('assigned_to_person_id', revenueScope.currentPersonId)
    }
    const { count } = await query
    return count ?? 0
  }

  let query = supabase
    .from('sales')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', start)
  if (isPersonal) query = query.eq('cashier_id', revenueScope.currentUserId)
  const { count } = await query
  return count ?? 0
}

export function TransactionsWidget({ businessId, widget, revenueScope }: Props) {
  const { data = 0, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId, revenueScope.mode, revenueScope.currentUserId, revenueScope.currentPersonId],
    queryFn: () => fetchCount(businessId, widget.type, revenueScope),
  })
  const title = revenueScope.mode === 'personal'
    ? widget.type === 'orders_today' ? 'My Orders Today' : 'My Sales Today'
    : widget.title

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
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
