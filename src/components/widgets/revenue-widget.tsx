'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, DollarSign } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import type { DashboardWidgetConfig, RevenueScope } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig; revenueScope: RevenueScope }

function applyDateWindow(type: string) {
  const now = new Date()
  if (type === 'revenue_today') {
    return new Date(now.setHours(0, 0, 0, 0)).toISOString()
  }
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
}

async function fetchRevenue(businessId: string, type: string, revenueScope: RevenueScope) {
  if (revenueScope.mode === 'hidden') return 0

  const supabase = createClient()
  const start = applyDateWindow(type)
  const isPersonal = revenueScope.mode === 'personal'

  let salesQuery = supabase
    .from('sales')
    .select('total')
    .eq('business_id', businessId)
    .eq('status', 'completed')
    .gte('created_at', start)
  if (isPersonal) salesQuery = salesQuery.eq('cashier_id', revenueScope.currentUserId)

  const ordersQuery = isPersonal && !revenueScope.currentPersonId
    ? Promise.resolve({ data: [] })
    : (() => {
        let query = supabase
          .from('orders')
          .select('total_amount, order_statuses!inner(name)')
          .eq('business_id', businessId)
          .in('order_statuses.name', ['Completed', 'Paid', 'Closed', 'Claimed'])
          .gte('created_at', start)
        if (isPersonal && revenueScope.currentPersonId) {
          query = query.eq('assigned_to_person_id', revenueScope.currentPersonId)
        }
        return query
      })()

  if (type === 'revenue_month') {
    let rentQuery = supabase
      .from('rent_payments')
      .select('amount')
      .eq('business_id', businessId)
      .gte('created_at', start)
    if (isPersonal) rentQuery = rentQuery.eq('created_by', revenueScope.currentUserId)

    const [{ data: sales }, { data: orders }, { data: rents }] = await Promise.all([
      salesQuery,
      ordersQuery,
      rentQuery,
    ])
    return (
      ((sales ?? []) as { total: number }[]).reduce((s, r) => s + r.total, 0) +
      ((orders ?? []) as { total_amount: number }[]).reduce((s, r) => s + r.total_amount, 0) +
      ((rents ?? []) as { amount: number }[]).reduce((s, r) => s + r.amount, 0)
    )
  }

  const [{ data: sales }, { data: orders }] = await Promise.all([
    salesQuery,
    ordersQuery,
  ])
  return (
    ((sales ?? []) as { total: number }[]).reduce((s, r) => s + r.total, 0) +
    ((orders ?? []) as { total_amount: number }[]).reduce((s, r) => s + r.total_amount, 0)
  )
}

export function RevenueWidget({ businessId, widget, revenueScope }: Props) {
  const { data = 0, isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId, revenueScope.mode, revenueScope.currentUserId, revenueScope.currentPersonId],
    queryFn: () => fetchRevenue(businessId, widget.type, revenueScope),
  })
  const title = revenueScope.mode === 'personal'
    ? widget.type === 'revenue_today' ? 'My Revenue Today' : 'My Revenue This Month'
    : widget.title

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
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
