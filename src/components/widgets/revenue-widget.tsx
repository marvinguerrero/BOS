'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchRevenue(businessId: string, type: string) {
  const supabase = createClient()
  const now = new Date()

  if (type === 'revenue_today') {
    const start = new Date(now.setHours(0, 0, 0, 0)).toISOString()
    const { data } = await supabase
      .from('sales')
      .select('total')
      .eq('business_id', businessId)
      .gte('created_at', start)
    return ((data ?? []) as { total: number }[]).reduce((s: number, r: { total: number }) => s + r.total, 0)
  }

  if (type === 'revenue_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const { data } = await supabase
      .from('rent_payments')
      .select('amount')
      .eq('business_id', businessId)
      .gte('created_at', start)
    return ((data ?? []) as { amount: number }[]).reduce((s: number, r: { amount: number }) => s + r.amount, 0)
  }

  return 0
}

export function RevenueWidget({ businessId, widget }: Props) {
  const { data = 0, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchRevenue(businessId, widget.type),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <DollarSign className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-8 w-24 bg-slate-100 rounded animate-pulse" />
        ) : (
          <div className="text-2xl font-bold">{formatCurrency(data)}</div>
        )}
        <div className="flex items-center gap-1 mt-1 text-xs text-green-600">
          <TrendingUp className="h-3 w-3" />
          <span>Live</span>
        </div>
      </CardContent>
    </Card>
  )
}
