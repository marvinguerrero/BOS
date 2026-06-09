'use client'

import { useQuery } from '@tanstack/react-query'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency } from '@/lib/utils/currency'
import { subDays, format, parseISO } from 'date-fns'
import type { DashboardWidgetConfig, RevenueScope } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig; revenueScope: RevenueScope }

async function fetchTrend(businessId: string, type: string, revenueScope: RevenueScope) {
  if (revenueScope.mode === 'hidden') return []

  const supabase = createClient()
  const days = 7
  const start = subDays(new Date(), days - 1)
  start.setHours(0, 0, 0, 0)
  const isPersonal = revenueScope.mode === 'personal'

  let data: Array<{ created_at: string; total?: number; amount?: number }> = []

  if (type === 'collection_trend') {
    let query = supabase
      .from('rent_payments')
      .select('created_at, amount')
      .eq('business_id', businessId)
      .gte('created_at', start.toISOString())
    if (isPersonal) query = query.eq('created_by', revenueScope.currentUserId)
    const { data: payments } = await query
    data = payments ?? []
  } else {
    let salesQuery = supabase
      .from('sales')
      .select('created_at, total')
      .eq('business_id', businessId)
      .eq('status', 'completed')
      .gte('created_at', start.toISOString())
    if (isPersonal) salesQuery = salesQuery.eq('cashier_id', revenueScope.currentUserId)

    const ordersQuery = isPersonal && !revenueScope.currentPersonId
      ? Promise.resolve({ data: [] })
      : (() => {
          let query = supabase
            .from('orders')
            .select('created_at, total_amount, order_statuses!inner(name)')
            .eq('business_id', businessId)
            .in('order_statuses.name', ['Completed', 'Paid', 'Closed', 'Claimed'])
            .gte('created_at', start.toISOString())
          if (isPersonal && revenueScope.currentPersonId) {
            query = query.eq('assigned_to_person_id', revenueScope.currentPersonId)
          }
          return query
        })()

    const [{ data: sales }, { data: orders }] = await Promise.all([salesQuery, ordersQuery])
    data = [
      ...((sales ?? []) as { created_at: string; total: number }[]),
      ...((orders ?? []) as { created_at: string; total_amount: number }[]).map(order => ({
        created_at: order.created_at,
        total: order.total_amount,
      })),
    ]
  }

  // Group by day
  const grouped: Record<string, number> = {}
  for (let i = 0; i < days; i++) {
    const d = format(subDays(new Date(), days - 1 - i), 'MMM d')
    grouped[d] = 0
  }
  data.forEach(row => {
    const d = format(parseISO(row.created_at), 'MMM d')
    grouped[d] = (grouped[d] ?? 0) + (row.total ?? row.amount ?? 0)
  })

  return Object.entries(grouped).map(([date, revenue]) => ({ date, revenue }))
}

export function SalesTrendWidget({ businessId, widget, revenueScope }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId, revenueScope.mode, revenueScope.currentUserId, revenueScope.currentPersonId],
    queryFn: () => fetchTrend(businessId, widget.type, revenueScope),
  })
  const title = revenueScope.mode === 'personal' ? 'My Revenue Trend' : widget.title

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-32 bg-slate-100 rounded animate-pulse" />
        ) : (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip formatter={(v) => formatCurrency(v as number)} />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                fill="url(#colorRevenue)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
