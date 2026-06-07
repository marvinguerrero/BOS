'use client'

import { useQuery } from '@tanstack/react-query'
import { Package } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatNumber } from '@/lib/utils/currency'
import { subDays } from 'date-fns'
import type { DashboardWidgetConfig } from '@/types'

interface Props { businessId: string; widget: DashboardWidgetConfig }

async function fetchTopProducts(businessId: string) {
  const supabase = createClient()
  const start = subDays(new Date(), 30).toISOString()

  const { data: salesRaw } = await supabase
    .from('sales')
    .select('id')
    .eq('business_id', businessId)
    .gte('created_at', start)
    .order('created_at', { ascending: false })
    .limit(500)

  const sales = salesRaw as Array<{ id: string }> | null
  if (!sales?.length) return []

  const saleIds = sales.map(s => s.id)
  const { data } = await supabase
    .from('sale_items')
    .select('product_id, quantity, total_price, products(name)')
    .in('sale_id', saleIds)
    .limit(2000)

  // Aggregate
  const map: Record<string, { name: string; qty: number; revenue: number }> = {};
  type ItemRow = { product_id: string; quantity: number; total_price: number; products: { name: string } | null }
  const rows = (data ?? []) as ItemRow[]
  rows.forEach(item => {
    if (!map[item.product_id]) {
      map[item.product_id] = { name: (item.products as { name: string })?.name ?? 'Unknown', qty: 0, revenue: 0 }
    }
    map[item.product_id].qty += item.quantity
    map[item.product_id].revenue += item.total_price
  })

  return Object.values(map)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
}

export function TopProductsWidget({ businessId, widget }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['widget', widget.id, businessId],
    queryFn: () => fetchTopProducts(businessId),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{widget.title}</CardTitle>
        <Package className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-5 bg-slate-100 rounded animate-pulse" />)}
          </div>
        ) : data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sales data yet</p>
        ) : (
          <div className="space-y-2">
            {data.map((p, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground w-4">{i + 1}</span>
                  <span className="text-sm truncate">{p.name}</span>
                </div>
                <span className="text-xs text-muted-foreground shrink-0 ml-2">{formatCurrency(p.revenue)}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
